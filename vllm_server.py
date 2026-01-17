import json
import os
import platform
import re
import signal
import subprocess
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, TextIO

from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config["SECRET_KEY"] = "vllm_gui_secret"
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    ping_timeout=60,
    ping_interval=25,
)

IS_LINUX = platform.system() == "Linux"
IS_WINDOWS = platform.system() == "Windows"

LOGS_FILE = "logs.txt"
logs_lock = threading.Lock()


class Logger:
    def __init__(self, file_path: str) -> None:
        self.file_path = file_path
        self._lock = threading.Lock()

    def log(self, level: str, message: str) -> None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        formatted = f"[{timestamp}] [{level.upper()}] {message}"
        with self._lock:
            with open(self.file_path, "a", encoding="utf-8") as f:
                f.write(formatted + "\n")
        socketio.emit("log", {"level": level, "message": formatted, "timestamp": timestamp})


logger = Logger(LOGS_FILE)


def validate_config(config: dict) -> tuple[bool, str]:
    """验证配置参数的安全性"""
    # 验证模型路径
    model_path = config.get("modelPath", "").strip()
    if not model_path:
        return False, "模型路径不能为空"
    
    # 防止路径遍历攻击
    if ".." in model_path:
        return False, "无效的模型路径"
    
    # 验证conda环境名称
    conda_env = config.get("condaEnv", "").strip()
    if conda_env and not re.match(r'^[a-zA-Z0-9_.-]+$', conda_env):
        return False, "Conda环境名称只能包含字母、数字、下划线、点和连字符"
    
    # 验证端口号
    port = config.get("port", "8000")
    if not port.isdigit() or not (1 <= int(port) <= 65535):
        return False, "端口号必须在1-65535之间"
    
    # 验证CUDA设备
    cuda_devices = config.get("cudaDevices", "")
    if cuda_devices and not re.match(r'^[0-9,]+$', cuda_devices):
        return False, "CUDA设备必须为数字或用逗号分隔的数字列表"
    
    # 验证张量并行大小
    tensor_parallel = config.get("tensorParallel", "1")
    if not tensor_parallel.isdigit() or not (1 <= int(tensor_parallel) <= 8):
        return False, "张量并行大小必须在1-8之间"
    
    # 验证GPU内存利用率
    gpu_memory_util = config.get("gpuMemoryUtil", "0.9")
    try:
        util = float(gpu_memory_util)
        if not (0.1 <= util <= 1.0):
            return False, "GPU内存利用率必须在0.1-1.0之间"
    except ValueError:
        return False, "GPU内存利用率必须是数字"
    
    # 验证自定义参数
    custom_params = config.get("customParams", [])
    for param in custom_params:
        if not isinstance(param, dict):
            return False, "自定义参数格式错误"
        name = param.get("name", "").strip()
        if not name:
            return False, "自定义参数名称不能为空"
        # 防止命令注入 - 只允许vLLM参数格式
        if not re.match(r'^--[a-zA-Z0-9-]+(?:-[a-zA-Z0-9-]+)*$', name):
            return False, f"无效的参数名称: {name}"
    
    return True, ""


def _find_conda_path() -> str:
    """自动检测conda安装路径"""
    # 方法1: 使用conda info --base命令（最准确）
    try:
        result = subprocess.run(
            ["conda", "info", "--base"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            base_path = result.stdout.strip()
            conda_init = os.path.join(base_path, "etc", "profile.d", "conda.sh")
            if os.path.exists(conda_init):
                logger.log("info", f"从conda info --base自动检测到conda路径: {base_path}")
                return base_path
    except Exception:
        pass
    
    # 方法2: 检查环境变量
    conda_path = os.environ.get("CONDA_PREFIX", "")
    if conda_path:
        # 从CONDA_PREFIX提取基础路径
        base_path = os.path.dirname(os.path.dirname(conda_path))
        conda_init = os.path.join(base_path, "etc", "profile.d", "conda.sh")
        if os.path.exists(conda_init):
            logger.log("info", f"从CONDA_PREFIX自动检测到conda路径: {base_path}")
            return base_path
    
    # 方法3: 检查CONDA_EXE环境变量
    conda_exe = os.environ.get("CONDA_EXE", "")
    if conda_exe and os.path.exists(conda_exe):
        # 从conda可执行文件推断路径
        if "/bin/conda" in conda_exe:
            base_path = os.path.dirname(os.path.dirname(conda_exe))
            conda_init = os.path.join(base_path, "etc", "profile.d", "conda.sh")
            if os.path.exists(conda_init):
                logger.log("info", f"从CONDA_EXE自动检测到conda路径: {base_path}")
                return base_path
    
    # 方法4: 常见conda路径列表
    common_paths = [
        os.path.expanduser("~/miniconda3"),
        os.path.expanduser("~/anaconda3"),
        os.path.expanduser("~/conda"),
        "/opt/conda",
        "/usr/local/conda",
        "/home/user/miniconda3",
        "/home/user/anaconda3",
    ]
    
    # 添加Windows WSL路径
    if IS_WINDOWS or os.environ.get("WSL_DISTRO_NAME"):
        # Windows用户通常通过WSL安装conda在Linux子系统中
        common_paths.extend([
            "/mnt/c/Users/*/miniconda3",
            "/mnt/c/Users/*/Anaconda3",
            "/mnt/c/ProgramData/miniconda3",
            "/mnt/c/ProgramData/Anaconda3",
        ])
    
    # 检查常见路径
    for path in common_paths:
        # 处理通配符路径
        if "*" in path:
            import glob
            expanded_paths = glob.glob(path)
            for expanded_path in expanded_paths:
                conda_init = os.path.join(expanded_path, "etc", "profile.d", "conda.sh")
                if os.path.exists(conda_init):
                    logger.log("info", f"从通配符路径自动检测到conda路径: {expanded_path}")
                    return expanded_path
        else:
            conda_init = os.path.join(path, "etc", "profile.d", "conda.sh")
            if os.path.exists(conda_init):
                logger.log("info", f"从常见路径自动检测到conda路径: {path}")
                return path
    
    # 方法5: 尝试使用which命令查找
    try:
        result = subprocess.run(
            ["which", "conda"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            conda_exe = result.stdout.strip()
            # 从/bin/conda推断路径
            if "/bin/conda" in conda_exe:
                base_path = os.path.dirname(os.path.dirname(conda_exe))
                conda_init = os.path.join(base_path, "etc", "profile.d", "conda.sh")
                if os.path.exists(conda_init):
                    logger.log("info", f"从which conda自动检测到conda路径: {base_path}")
                    return base_path
    except Exception:
        pass
    
    # 默认返回用户主目录下的miniconda3
    default_path = os.path.expanduser("~/miniconda3")
    logger.log("warning", f"未找到conda安装，使用默认路径: {default_path}")
    return default_path


def _wsl_command_exists() -> bool:
    """检查wsl命令是否存在"""
    if IS_WINDOWS:
        return True
    try:
        result = subprocess.run(
            ["which", "wsl"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def _normalize_wsl_path(path: str) -> str:
    """标准化WSL路径，处理Windows驱动器挂载点映射
    
    将常见的Windows驱动器挂载点（如/mnt/i/）转换为实际的挂载点（如/mnt/AI-Acer4T/）
    如果路径不存在，尝试常见的映射
    """
    if not path or not path.startswith('/mnt/'):
        return path
    
    # 如果路径已经存在，直接返回
    if os.path.exists(path):
        return path
    
    # 常见Windows驱动器映射
    drive_mappings = [
        ('/mnt/i/', '/mnt/AI-Acer4T/'),      # I: 驱动器
        ('/mnt/c/', '/mnt/c/'),              # C: 驱动器（通常不变）
        ('/mnt/d/', '/mnt/d/'),              # D: 驱动器
        ('/mnt/e/', '/mnt/e/'),              # E: 驱动器
    ]
    
    # 检查所有映射
    for old_prefix, new_prefix in drive_mappings:
        if path.startswith(old_prefix):
            # 尝试替换前缀
            new_path = path.replace(old_prefix, new_prefix, 1)
            if os.path.exists(new_path):
                logger.log("info", f"路径映射: {path} -> {new_path}")
                return new_path
    
    # 如果没有找到映射，尝试自动检测挂载点
    # 查找/mnt/目录下的所有挂载点
    try:
        if os.path.exists('/mnt/'):
            for mount_point in os.listdir('/mnt/'):
                mount_path = os.path.join('/mnt/', mount_point)
                if os.path.isdir(mount_path):
                    # 尝试用这个挂载点替换第一个路径组件
                    parts = path.split('/')
                    if len(parts) >= 3 and parts[1] == 'mnt':
                        # 替换第二个组件（驱动器字母）
                        parts[2] = mount_point
                        new_path = '/'.join(parts)
                        if os.path.exists(new_path):
                            logger.log("info", f"自动检测路径映射: {path} -> {new_path}")
                            return new_path
    except Exception:
        pass
    
    # 如果都不存在，返回原始路径（让vLLM处理错误）
    return path


class VLLMController:
    def __init__(self, socketio_instance: SocketIO) -> None:
        self.process: Optional[subprocess.Popen] = None
        self.nvitop_process: Optional[subprocess.Popen] = None
        self.is_running = False
        self.command_queue: List[str] = []
        self._lock = threading.Lock()
        self._socketio = socketio_instance
        self.env_type = "wsl"

    def generate_command(self, config: dict) -> str:
        # 验证配置参数（仅记录警告，不阻止命令生成）
        is_valid, error_msg = validate_config(config)
        if not is_valid:
            logger.log("warning", f"配置验证警告（仍将生成命令）: {error_msg}")
        
        model_path = config.get("modelPath", "").strip()
        # 允许空模型路径 - 命令仍将生成但可能无法运行
        # 这是根据优化项5的要求：即使参数错误也可以生成命令
        # 标准化WSL路径
        model_path = _normalize_wsl_path(model_path)

        wsl_path = config.get("wslPath", "wsl")
        conda_env = config.get("condaEnv", "vllm")
        conda_path = config.get("condaPath", "")
        env_type = config.get("envType", "wsl")
        host = config.get("host", "0.0.0.0")
        port = config.get("port", "8000")
        gpu_memory_util = config.get("gpuMemoryUtil", "0.9")
        tensor_parallel = config.get("tensorParallel", "1")
        pipeline_parallel = str(config.get("pipelineParallelSize", "1"))
        max_model_len = config.get("maxModelLen", "")
        dtype = config.get("dtype", "auto")
        quantization = config.get("quantization", "")
        cuda_devices = config.get("cudaDevices", "0")
        prefix_cache = config.get("prefixCache", "")
        if prefix_cache:
            prefix_cache = _normalize_wsl_path(prefix_cache)
        enable_chunked = config.get("enableChunked", False)
        custom_all_reduce = config.get("customAllReduce", "")
        if custom_all_reduce:
            custom_all_reduce = _normalize_wsl_path(custom_all_reduce)
        enable_prefix_caching = config.get("enablePrefixCaching", False)
        max_num_seqs = config.get("maxNumSeqs", "256")
        max_num_batched_tokens = config.get("maxNumBatchedTokens", "8192")
        custom_params = config.get("customParams", [])
        served_model_name = config.get("servedModelName", "")
        chat_template = config.get("chatTemplate", "")
        if chat_template:
            chat_template = _normalize_wsl_path(chat_template)
        tool_call_parser = config.get("toolCallParser", "")
        reasoning_parser = config.get("reasoningParser", "")
        trust_remote_code = config.get("trustRemoteCode", False)
        enable_expert_parallel = config.get("enableExpertParallel", False)
        enable_auto_tool_choice = config.get("enableAutoToolChoice", False)
        async_scheduling = config.get("asyncScheduling", False)



        vllm_cmd = ["--model", model_path]
        vllm_cmd.extend(["--host", host])
        vllm_cmd.extend(["--port", port])
        vllm_cmd.extend(["--gpu-memory-utilization", gpu_memory_util])
        vllm_cmd.extend(["--tensor-parallel-size", tensor_parallel])
        
        if pipeline_parallel and pipeline_parallel != "1":
            vllm_cmd.extend(["--pipeline-parallel-size", pipeline_parallel])

        if max_model_len:
            vllm_cmd.extend(["--max-model-len", max_model_len])

        if dtype and dtype != "auto":
            vllm_cmd.extend(["--dtype", dtype])

        if quantization:
            vllm_cmd.extend(["--quantization", quantization])

        if enable_prefix_caching:
            vllm_cmd.append("--enable-prefix-caching")

        if prefix_cache:
            vllm_cmd.extend(["--prefix-cache-dir", prefix_cache])

        if enable_chunked:
            vllm_cmd.append("--enable-chunked-prefill")

        if custom_all_reduce:
            vllm_cmd.extend(["--custom-all-reduce", custom_all_reduce])

        vllm_cmd.extend(["--max-num-seqs", max_num_seqs])
        vllm_cmd.extend(["--max-num-batched-tokens", max_num_batched_tokens])

        if served_model_name:
            vllm_cmd.extend(["--served-model-name", served_model_name])

        if chat_template:
            vllm_cmd.extend(["--chat-template", chat_template])

        if tool_call_parser:
            vllm_cmd.extend(["--tool-call-parser", tool_call_parser])

        if reasoning_parser:
            vllm_cmd.extend(["--reasoning-parser", reasoning_parser])

        if trust_remote_code:
            vllm_cmd.append("--trust-remote-code")

        if enable_expert_parallel:
            vllm_cmd.append("--enable-expert-parallel")

        if enable_auto_tool_choice:
            vllm_cmd.append("--enable-auto-tool-choice")

        if async_scheduling:
            vllm_cmd.append("--async-scheduling")

        if custom_params and isinstance(custom_params, list):
            for param in custom_params:
                if isinstance(param, dict):
                    param_name = param.get("name", "").strip()
                    param_value = param.get("value", "").strip()
                    is_flag = param.get("isFlag", False)

                    if param_name:
                        if is_flag:
                            vllm_cmd.append(param_name)
                        elif param_value:
                            vllm_cmd.extend([param_name, param_value])

        vllm_cmd_str = " ".join(vllm_cmd)

        # Build the full command
        if env_type == "wsl":
            wsl_path = wsl_path or "wsl"
            source_cmd = "source /etc/profile 2>/dev/null || true && source ~/.bashrc 2>/dev/null || true"
            if not conda_path:
                conda_path = _find_conda_path()
            conda_init = f"{conda_path}/etc/profile.d/conda.sh"
            source_conda = f"source {conda_init} 2>/dev/null || true"
            
            # 构建export命令，在conda activate之后执行
            export_commands = config.get("exportCommands", [])
            all_exports = []
            if cuda_devices:
                all_exports.append(f"export CUDA_VISIBLE_DEVICES={cuda_devices}")
            for ec in export_commands:
                if ec.strip():
                    all_exports.append(ec.strip())
            
            if all_exports:
                export_str = " && ".join(all_exports)
                activate_cmd = f"conda activate {conda_env} && {export_str}"
            else:
                activate_cmd = f"conda activate {conda_env}"
            
            # 使用vllm serve启动 - 模型路径作为位置参数
            # 从vllm_cmd_str中移除--model参数，将模型路径作为vllm serve的第一个参数
            vllm_cmd_parts = vllm_cmd_str.split()
            serve_cmd_parts = ["vllm", "serve"]
            
            # 查找--model参数并提取模型路径
            model_path_arg = ""
            i = 0
            while i < len(vllm_cmd_parts):
                if vllm_cmd_parts[i] == "--model" and i + 1 < len(vllm_cmd_parts):
                    model_path_arg = vllm_cmd_parts[i + 1]
                    i += 2  # 跳过--model和模型路径
                else:
                    serve_cmd_parts.append(vllm_cmd_parts[i])
                    i += 1
            
            # 如果有模型路径，作为位置参数添加
            if model_path_arg:
                serve_cmd_parts.insert(2, model_path_arg)  # 在"vllm" "serve"之后插入模型路径
            
            vllm_start_cmd = " ".join(serve_cmd_parts)
            full_command = f'{wsl_path} bash -c "{source_cmd} && {source_conda} && {activate_cmd} && {vllm_start_cmd}"'
        elif env_type == "linux":
            # Linux环境：使用conda activate，在激活后执行export命令
            source_cmd = "source /etc/profile 2>/dev/null || source ~/.bashrc 2>/dev/null || true"
            if not conda_path:
                conda_path = _find_conda_path()
            else:
                # 展开用户目录缩写（如 ~/miniconda3 -> /home/user/miniconda3）
                conda_path = os.path.expanduser(conda_path)
            conda_init = f"{conda_path}/etc/profile.d/conda.sh"
            source_conda = f"source {conda_init} 2>/dev/null || true"
            
            # 构建export命令，在conda activate之后执行
            export_commands = config.get("exportCommands", [])
            all_exports = []
            if cuda_devices:
                all_exports.append(f"export CUDA_VISIBLE_DEVICES={cuda_devices}")
            for ec in export_commands:
                if ec.strip():
                    all_exports.append(ec.strip())
            
            if all_exports:
                export_str = " && ".join(all_exports)
                activate_cmd = f"conda activate {conda_env} && {export_str}"
            else:
                activate_cmd = f"conda activate {conda_env}"
            
            # 使用vllm serve启动 - 模型路径作为位置参数
            # 从vllm_cmd_str中移除--model参数，将模型路径作为vllm serve的第一个参数
            vllm_cmd_parts = vllm_cmd_str.split()
            serve_cmd_parts = ["vllm", "serve"]
            
            # 查找--model参数并提取模型路径
            model_path_arg = ""
            i = 0
            while i < len(vllm_cmd_parts):
                if vllm_cmd_parts[i] == "--model" and i + 1 < len(vllm_cmd_parts):
                    model_path_arg = vllm_cmd_parts[i + 1]
                    i += 2  # 跳过--model和模型路径
                else:
                    serve_cmd_parts.append(vllm_cmd_parts[i])
                    i += 1
            
            # 如果有模型路径，作为位置参数添加
            if model_path_arg:
                serve_cmd_parts.insert(2, model_path_arg)  # 在"vllm" "serve"之后插入模型路径
            
            vllm_start_cmd = " ".join(serve_cmd_parts)
            full_command = f'/bin/bash -c "{source_cmd} && {source_conda} && {activate_cmd} && {vllm_start_cmd}"'
        else:
            if not conda_path:
                conda_path = os.path.expanduser("~/miniconda3")
            conda_init = f"{conda_path}/etc/profile.d/conda.sh"
            source_conda = f"source {conda_init} 2>/dev/null || true"
            
            # 构建export命令，在conda activate之后执行
            export_commands = config.get("exportCommands", [])
            all_exports = []
            if cuda_devices:
                all_exports.append(f"export CUDA_VISIBLE_DEVICES={cuda_devices}")
            for ec in export_commands:
                if ec.strip():
                    all_exports.append(ec.strip())
            
            if all_exports:
                export_str = " && ".join(all_exports)
                activate_cmd = f"conda activate {conda_env} && {export_str}"
            else:
                activate_cmd = f"conda activate {conda_env}"
            
            # 使用vllm serve启动 - 模型路径作为位置参数
            # 从vllm_cmd_str中移除--model参数，将模型路径作为vllm serve的第一个参数
            vllm_cmd_parts = vllm_cmd_str.split()
            serve_cmd_parts = ["vllm", "serve"]
            
            # 查找--model参数并提取模型路径
            model_path_arg = ""
            i = 0
            while i < len(vllm_cmd_parts):
                if vllm_cmd_parts[i] == "--model" and i + 1 < len(vllm_cmd_parts):
                    model_path_arg = vllm_cmd_parts[i + 1]
                    i += 2  # 跳过--model和模型路径
                else:
                    serve_cmd_parts.append(vllm_cmd_parts[i])
                    i += 1
            
            # 如果有模型路径，作为位置参数添加
            if model_path_arg:
                serve_cmd_parts.insert(2, model_path_arg)  # 在"vllm" "serve"之后插入模型路径
            
            vllm_start_cmd = " ".join(serve_cmd_parts)
            full_command = f"wsl bash -c '{source_conda} && {activate_cmd} && {vllm_start_cmd}'"

        return full_command

    def generate_nvitop_command(self, env_type: str) -> list:
        """生成nvitop监控命令"""
        # 在Linux原生环境下不使用wsl前缀
        if env_type == "linux" and not IS_WINDOWS:
            return ["nvitop", "-o"]
        elif env_type == "wsl":
            return ["wsl", "nvitop", "-o"]
        else:
            # 默认使用wsl（适用于WSL2或Windows环境）
            return ["wsl", "nvitop", "-o"]

    def start_nvitop(self, env_type: str) -> None:
        """启动nvitop监控进程"""
        with self._lock:
            if self.nvitop_process and self.nvitop_process.poll() is None:
                return  # 进程仍在运行

        try:
            nvitop_cmd = self.generate_nvitop_command(env_type)
            env = os.environ.copy()
            env.update({
                'PYTHONIOENCODING': 'utf-8',
                'LANG': 'en_US.UTF-8',
                'LC_ALL': 'en_US.UTF-8',
            })

            if env_type == "wsl" or (env_type == "wsl2" and IS_WINDOWS):
                startupinfo = None
                if IS_WINDOWS:
                    startupinfo = subprocess.STARTUPINFO()  # type: ignore
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW  # type: ignore
                self.nvitop_process = subprocess.Popen(
                    nvitop_cmd,
                    shell=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    env=env,
                    startupinfo=startupinfo,
                )
            else:
                self.nvitop_process = subprocess.Popen(
                    nvitop_cmd,
                    shell=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    env=env,
                )

            logger.log("info", "nvitop监控已启动")

            def read_nvitop_output():
                proc = self.nvitop_process
                try:
                    if proc and proc.stdout:
                        buffer = ""
                        for line in proc.stdout:
                            if line:
                                buffer += line
                                if "\n" in buffer:
                                    lines = buffer.split("\n")
                                    buffer = lines[-1] if len(lines) > 1 else ""
                                    for l in lines[:-1]:
                                        if l.strip():
                                            try:
                                                l = l.encode('utf-8').decode('utf-8', errors='replace')
                                                socketio.emit("nvitop", {"output": l.strip()})
                                            except Exception:
                                                pass
                        if buffer.strip():
                            socketio.emit("nvitop", {"output": buffer.strip()})
                except Exception:
                    pass
                finally:
                    with self._lock:
                        # 检查是否还是同一个进程，避免竞态条件
                        if self.nvitop_process == proc:
                            self.nvitop_process = None

            threading.Thread(target=read_nvitop_output, daemon=True).start()

        except subprocess.SubprocessError as e:
            logger.log("error", f"nvitop启动失败: {str(e)}")
        except Exception as e:
            logger.log("error", f"nvitop启动异常: {str(e)}")

    def stop_nvitop(self) -> bool:
        """停止nvitop监控进程"""
        with self._lock:
            if not self.nvitop_process:
                return False
            proc = self.nvitop_process

        try:
            if IS_WINDOWS:
                subprocess.run(["taskkill", "/F", "/PID", str(proc.pid)], shell=False, capture_output=True)
            else:
                proc.terminate()
            self.nvitop_process = None
            logger.log("info", "nvitop监控已停止")
            return True
        except Exception as e:
            logger.log("error", f"停止nvitop失败: {str(e)}")
            return False

    def run_command(self, command: str, env_type: str) -> None:
        self.env_type = env_type

        with self._lock:
            if self.process:
                return

        logger.log("info", f"启动命令: {command[:100]}...")

        env = os.environ.copy()
        env.update({
            'PYTHONIOENCODING': 'utf-8',
            'LANG': 'en_US.UTF-8',
            'LC_ALL': 'en_US.UTF-8',
            'PYTHONUNBUFFERED': '1',
        })

        try:
            # 检查是否需要处理wsl命令
            actual_env_type = env_type
            actual_command = command
            
            if env_type == "wsl" or env_type == "wsl2":
                if not _wsl_command_exists():
                    # wsl命令不存在，尝试去除wsl前缀直接执行
                    logger.log("warning", "wsl命令不存在，将在当前环境直接执行命令")
                    if command.startswith("wsl "):
                        actual_command = command[4:]  # 去除 "wsl " 前缀
                    actual_env_type = "linux"  # 切换到linux模式执行

            if actual_env_type == "linux":
                self.process = subprocess.Popen(
                    actual_command,
                    shell=True,
                    executable='/bin/bash',  # 明确使用bash，source命令需要bash
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    env=env,
                )
            else:
                # Windows或WSL环境
                startupinfo = None
                if IS_WINDOWS:
                    startupinfo = subprocess.STARTUPINFO()  # type: ignore
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW  # type: ignore
                self.process = subprocess.Popen(
                    actual_command,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    env=env,
                    startupinfo=startupinfo,
                )

            self.is_running = True
            self._socketio.emit("status", {"running": True, "pid": self.process.pid})

            self.start_nvitop(env_type)

        except subprocess.SubprocessError as e:
            logger.log("error", f"子进程执行失败: {str(e)}")
            self._socketio.emit("status", {"running": False, "error": str(e)})
            return

        def read_output():
            try:
                proc = self.process
                if proc and proc.stdout:
                    for line in proc.stdout:
                        if line:
                            try:
                                line = line.encode('utf-8').decode('utf-8', errors='replace')
                                if "WARNING" in line:
                                    logger.log("warning", line.strip())
                                elif "ERROR" in line or "Traceback" in line:
                                    logger.log("error", line.strip())
                                else:
                                    logger.log("info", line.strip())
                            except Exception:
                                logger.log("info", line.strip())
                    proc.wait()
            except Exception:
                pass
            finally:
                self.stop_nvitop()
                with self._lock:
                    self.is_running = False
                    self.process = None
                self._socketio.emit("status", {"running": False})

        threading.Thread(target=read_output, daemon=True).start()

    def stop(self, keep_nvitop: bool = True) -> bool:
        """停止vLLM进程，支持Windows和Linux/WSL环境
        
        Args:
            keep_nvitop: 是否保持nvitop监控运行（默认True）
        """
        with self._lock:
            if not self.process:
                # 进程已经在停止中或已停止，视为成功
                if not self.is_running:
                    return True
                return False
            proc = self.process

        try:
            # 保存env_type用于后续重启nvitop
            env_type = getattr(self, 'env_type', 'wsl')
            
            # 先停止nvitop（如果需要保持运行，稍后会重启）
            if keep_nvitop:
                self.stop_nvitop()
            
            if IS_WINDOWS:
                # Windows: 终止进程及其子进程
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], shell=False, capture_output=True)
            else:
                # Linux/WSL: 终止整个进程组
                try:
                    # 首先尝试使用 pkill 终止进程组
                    subprocess.run(["pkill", "-9", "-P", str(proc.pid)], shell=False, capture_output=True)
                    # 然后终止主进程
                    subprocess.run(["kill", "-9", str(proc.pid)], shell=False, capture_output=True)
                except (ProcessLookupError, PermissionError, OSError):
                    # 如果失败，尝试直接终止进程
                    subprocess.run(["kill", "-9", str(proc.pid)], shell=False, capture_output=True, stderr=subprocess.DEVNULL)
            
            # 等待进程完全终止
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # 如果进程仍然运行，强制杀死
                try:
                    if IS_WINDOWS:
                        subprocess.run(["taskkill", "/F", "/PID", str(proc.pid)], shell=False, capture_output=True)
                    else:
                        subprocess.run(["kill", "-9", str(proc.pid)], shell=False, capture_output=True)
                    proc.wait(timeout=2)
                except Exception:
                    pass
            
            self.process = None
            self.is_running = False
            logger.log("info", "服务已停止")
            self._socketio.emit("status", {"running": False})
            
            # 如果需要保持nvitop运行，则重启它
            if keep_nvitop:
                threading.Timer(1.0, lambda: self.start_nvitop(env_type)).start()
            
            return True
        except Exception as e:
            logger.log("error", f"停止服务失败: {str(e)}")
            # 即使出错，也重置状态
            self.process = None
            self.is_running = False
            self._socketio.emit("status", {"running": False})
            return False

    def send_command(self, cmd: str) -> None:
        if not self.process:
            return

        self.command_queue.append(cmd)
        logger.log("command", f"执行命令: {cmd}")
        self._socketio.emit("command_sent", {"command": cmd})


vllm_controller = VLLMController(socketio)


@app.route("/")
def index():
    return send_file("vllm_complete.html")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(".", filename)


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "running": vllm_controller.is_running})


@app.route("/api/detect-environment", methods=["GET"])
def detect_environment():
    """Detect the current environment type: native Linux, WSL, or Windows"""
    # If running on Windows, we need WSL to run vLLM commands
    if IS_WINDOWS:
        return jsonify({
            "environment": "wsl",
            "is_windows": True,
            "is_linux": False
        })
    
    # Running on Linux - check if it's WSL or native Linux
    is_wsl = False
    
    # Method 1: Check /proc/version for Microsoft signature
    try:
        with open("/proc/version", "r") as f:
            version = f.read().lower()
            if "microsoft" in version or "wsl" in version:
                is_wsl = True
    except Exception:
        pass
    
    # Method 2: Check WSL environment variables
    if not is_wsl and (os.environ.get("WSL_DISTRO_NAME") or os.environ.get("WSL_INTEROP")):
        is_wsl = True
    
    # Method 3: Check /proc/sys/kernel/osrelease
    if not is_wsl:
        try:
            with open("/proc/sys/kernel/osrelease", "r") as f:
                osrelease = f.read().lower()
                if "microsoft" in osrelease or "wsl" in osrelease:
                    is_wsl = True
        except Exception:
            pass
    
    # Method 4: Check uname output
    if not is_wsl:
        try:
            result = subprocess.run(
                ["uname", "-a"],
                capture_output=True,
                text=True,
                timeout=2
            )
            if "microsoft" in result.stdout.lower() or "wsl" in result.stdout.lower():
                is_wsl = True
        except Exception:
            pass
    
    environment = "wsl" if is_wsl else "linux"
    
    return jsonify({
        "environment": environment,
        "is_windows": False,
        "is_linux": True
    })


@app.route("/api/detect-conda", methods=["GET"])
def detect_conda():
    """Detect conda installation path and available environments"""
    conda_path = _find_conda_path()
    envs = []
    
    # List available environments
    envs_dir = os.path.join(conda_path, "envs")
    if os.path.exists(envs_dir):
        for item in os.listdir(envs_dir):
            env_path = os.path.join(envs_dir, item)
            if os.path.isdir(env_path) and os.path.exists(os.path.join(env_path, "bin", "python")):
                envs.append(item)
    
    # Also check for base environment
    base_python = os.path.join(conda_path, "bin", "python")
    if os.path.exists(base_python):
        envs.insert(0, "base")
    
    return jsonify({
        "conda_path": conda_path,
        "environments": envs
    })


@app.route("/api/generate-command", methods=["POST"])
def api_generate_command():
    config = request.json
    command = vllm_controller.generate_command(config)
    return jsonify({"command": command})


@app.route("/api/run", methods=["POST"])
def api_run():
    data = request.json
    command = data.get("command", "")
    env_type = data.get("envType", "wsl")
    if command:
        vllm_controller.run_command(command, env_type)
        return jsonify({"success": True, "status": "started"})
    return jsonify({"success": False, "error": "No command provided"}), 400


@app.route("/api/stop", methods=["POST"])
def api_stop():
    success = vllm_controller.stop()
    return jsonify({"success": success})


@app.route("/api/save-script", methods=["POST"])
def api_save_script():
    """Save startup script to project directory"""
    try:
        data = request.json
        filename = data.get("filename", "vllm_server.sh")
        content = data.get("content", "")
        
        # Sanitize filename - only allow alphanumeric, underscores, hyphens
        import re
        filename = re.sub(r'[^a-zA-Z0-9_-]', '', filename)
        if not filename.endswith(".sh"):
            filename += ".sh"
        
        # Save to project directory (current working directory)
        script_path = os.path.join(os.getcwd(), filename)
        
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        # Make executable (Linux/WSL only)
        try:
            os.chmod(script_path, 0o755)
        except OSError:
            pass  # Windows doesn't support chmod
        
        logger.log("success", f"Script saved: {script_path}")
        return jsonify({"success": True, "path": script_path})
    except Exception as e:
        logger.log("error", f"Failed to save script: {str(e)}")
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/logs", methods=["GET"])
def api_logs():
    if os.path.exists(LOGS_FILE):
        with open(LOGS_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
            last_lines = lines[-500:] if len(lines) > 500 else lines
            return jsonify({"logs": "".join(last_lines)})
    return jsonify({"logs": ""})


@app.route("/api/clear-logs", methods=["POST"])
def api_clear_logs():
    with logs_lock:
        with open(LOGS_FILE, "w", encoding="utf-8") as f:
            f.write("")
    return jsonify({"status": "cleared"})


@app.route("/api/gpu-status", methods=["GET"])
def api_gpu_status():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw",
             "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5
        )
        if result.returncode == 0:
            gpus = []
            for line in result.stdout.strip().split("\n"):
                if line:
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 6:
                        gpus.append({
                            "name": parts[0],
                            "memory_used": parts[1],
                            "memory_total": parts[2],
                            "utilization": parts[3],
                            "temperature": parts[4],
                            "power": parts[5]
                        })
            return jsonify({"status": "ok", "gpus": gpus})
        else:
            return jsonify({"status": "error", "message": "无法获取GPU信息"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/api/nvitop", methods=["POST"])
def api_nvitop():
    """nvitop监控控制接口"""
    action = request.json.get("action", "")

    if action == "start":
        env_type = request.json.get("envType", "wsl")
        vllm_controller.start_nvitop(env_type)
        return jsonify({"status": "started"})

    elif action == "stop":
        success = vllm_controller.stop_nvitop()
        return jsonify({"success": success})

    return jsonify({"error": "Invalid action"}), 400


@app.route("/api/send-input", methods=["POST"])
def api_send_input():
    """Send input to running vLLM process"""
    try:
        data = request.json
        command = data.get("command", "")
        if command and vllm_controller.process:
            vllm_controller.send_command(command)
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "No process running"}), 400
    except Exception as e:
        logger.log("error", f"Failed to send input: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/execute", methods=["POST"])
def api_execute():
    """Execute a command in a separate terminal window"""
    try:
        data = request.json
        command = data.get("command", "")
        env_type = data.get("env", "wsl")

        if not command:
            return jsonify({"success": False, "error": "No command provided"}), 400

        # Determine the terminal command based on environment
        if IS_WINDOWS:
            # In Windows/WSL environment, use wsl to execute commands
            if env_type in ["wsl", "wsl2"]:
                # Execute in WSL with a new terminal window
                terminal_cmd = f"wsl bash -c '{command}'"
                subprocess.run(f'cmd.exe /c start cmd.exe /c "{terminal_cmd}"', shell=True)
                logger.log("info", f"Executed command in new WSL terminal: {command}")
            else:
                # Linux environment in Windows
                terminal_cmd = f"wsl bash -c '{command}'"
                subprocess.run(f'cmd.exe /c start cmd.exe /c "{terminal_cmd}"', shell=True)
                logger.log("info", f"Executed command in new terminal: {command}")
        else:
            # Linux environment - open command in a new terminal window
            try:
                # Try different terminal emulators in order of preference
                terminal_launchers = [
                    ["xterm", "-e", f"bash -c '{command}; echo; read -p \"按Enter键关闭...\"'"],
                    ["gnome-terminal", "--", "bash", "-c", f"{command}; read -p '按Enter键关闭...'"],
                    ["konsole", "-e", "bash", "-c", f"{command}; read -p '按Enter键关闭...'"],
                    ["xfce4-terminal", "-e", f"bash -c '{command}; read -p '按Enter键关闭...\"'"]
                ]
                for launcher in terminal_launchers:
                    try:
                        subprocess.run(launcher, check=False, capture_output=True)
                        if launcher[0] != "xterm":
                            logger.log("info", f"Executed command in new terminal ({launcher[0]}): {command}")
                        break
                    except FileNotFoundError:
                        continue
                else:
                    # Fallback: use xdg-open to run command
                    subprocess.run(f"bash -c '{command}' &", shell=True)
                    logger.log("info", f"Executed command in background: {command}")
            except Exception as e:
                # Ultimate fallback
                subprocess.run(f"{command} &", shell=True)
                logger.log("info", f"Executed command in background: {command}")

        return jsonify({
            "success": True,
            "output": f"Command sent to terminal: {command}",
            "error": ""
        })
    except Exception as e:
        logger.log("error", f"Command execution failed: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@socketio.on("connect")
def handle_connect():
    socketio.emit("status", {"running": vllm_controller.is_running})


@socketio.on("run_command")
def handle_run_command(data):
    command = data.get("command", "")
    env_type = data.get("envType", "wsl")
    if command:
        vllm_controller.run_command(command, env_type)


@socketio.on("stop_command")
def handle_stop_command(data):
    vllm_controller.stop()


@socketio.on("send_input")
def handle_send_input(data):
    cmd = data.get("command", "")
    if cmd and vllm_controller.process:
        vllm_controller.send_command(cmd)


@app.route("/api/shutdown", methods=["POST"])
def api_shutdown():
    """Shutdown the Flask server"""
    try:
        # Stop vLLM server if running
        vllm_controller.stop()
        logger.log("success", "正在关闭服务器...")
        
        # Shutdown the Flask server
        func = request.environ.get('werkzeug.server.shutdown')
        if func is None:
            # For production servers, use os._exit
            import os
            os._exit(0)
        else:
            func()
        
        return jsonify({"success": True, "message": "服务器正在关闭"})
    except Exception as e:
        logger.log("error", f"关闭服务器失败: {str(e)}")
        return jsonify({"success": False, "message": str(e)})


def signal_handler(signum, frame):
    vllm_controller.stop()
    socketio.stop()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="VLLM GUI Server")
    parser.add_argument("--port", type=int, default=5000, help="Server port (default: 5000)")
    args = parser.parse_args()

    if not os.path.exists(LOGS_FILE):
        with open(LOGS_FILE, "w", encoding="utf-8") as f:
            f.write("")

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.log("info", f"VLLM GUI 服务器启动，端口: {args.port}")
    socketio.run(app, host="0.0.0.0", port=args.port, debug=False)
