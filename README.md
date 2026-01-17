# VLLM-GUI

一款跨平台的 Web 界面工具，用于配置和运行 vLLM 推理服务器，支持 WSL/Windows/Linux 环境。

A cross-platform web-based GUI tool for configuring and running vLLM inference server, with support for WSL/Windows/Linux environments.

---

## 功能特性 | Features

### 环境配置 | Environment Configuration

| 中文 | English |
|------|---------|
| 多环境支持：WSL、WSL2、Linux 原生模式自动检测 | Multi-environment support: WSL, WSL2, Linux native mode with auto-detection |
| Conda 环境管理：自动激活指定的 Conda 环境 | Conda environment management: Automatic activation of specified Conda environments |
| GPU 设备选择：通过 CUDA_VISIBLE_DEVICES 配置使用的 GPU | GPU device selection: Configure GPUs via CUDA_VISIBLE_DEVICES |
| 张量并行：支持多卡并行推理（tensor-parallel-size）| Tensor parallelism: Support for multi-GPU parallel inference (tensor-parallel-size) |

### 模型配置 | Model Configuration

| 中文 | English |
|------|---------|
| 模型路径：支持本地路径和 Windows 挂载路径（/mnt/）| Model path: Support for local paths and Windows mounted paths (/mnt/) |
| 量化类型：FP8、MXFP4、AWQ、GPTQ 支持 | Quantization types: FP8, MXFP4, AWQ, GPTQ support |
| 数据类型：bf16、fp16、auto | Data types: bf16, fp16, auto |
| 最大序列长度：自定义 max-model-len | Max sequence length: Custom max-model-len |
| 聊天模板：支持自定义 jinja 模板路径 | Chat template: Custom jinja template path support |
| 信任远程代码：trust-remote-code 选项 | Trust remote code: trust-remote-code option |

### 推理设置 | Inference Settings

| 中文 | English |
|------|---------|
| 张量并行大小：1-8 卡配置 | Tensor parallel size: 1-8 GPU configuration |
| GPU 内存利用率：0.1-1.0 可调 | GPU memory utilization: 0.1-1.0 adjustable |
| 最大并发序列数：控制批处理大小 | Max concurrent sequences: Control batch size |
| 最大批处理令牌数：细粒度批处理控制 | Max batched tokens: Fine-grained batch control |
| 服务端口：自定义 API 服务器端口 | Service port: Custom API server port |
| 服务模型名称：OpenAI 兼容的模型命名 | Service model name: OpenAI-compatible model naming |

### 高级选项 | Advanced Options

| 中文 | English |
|------|---------|
| 前缀缓存：加速重复请求 | Prefix caching: Accelerate repeated requests |
| 分块预填充：优化长序列处理 | Chunked prefill: Optimize long sequence processing |
| 异步调度：提升高并发场景性能 | Async scheduling: Improve high-concurrency performance |
| 自动工具选择：启用 ReAct 风格的工具调用 | Auto tool selection: Enable ReAct-style tool calling |
| 工具调用解析器：openai、Outlines 等 | Tool call parser: openai, Outlines, etc. |
| 推理解析器：openai_gptoss 等 | Inference parser: openai_gptoss, etc. |

### 实时监控 | Real-time Monitoring

| 中文 | English |
|------|---------|
| GPU 状态：基于 nvidia-smi 的实时监控 | GPU status: Real-time monitoring via nvidia-smi |
| nvitop 集成：详细的 GPU 进程和内存监控 | nvitop integration: Detailed GPU process and memory monitoring |
| WebSocket 日志：实时终端输出流 | WebSocket logs: Real-time terminal output stream |
| 错误处理：自动捕获和显示 vLLM 错误信息 | Error handling: Automatic capture and display of vLLM errors |

### 配置管理 | Configuration Management

| 中文 | English |
|------|---------|
| 方案保存：将当前配置保存为命名方案 | Scheme save: Save current configuration as named schemes |
| 方案加载：快速切换不同模型配置 | Scheme load: Quick switching between model configurations |
| 方案重命名：编辑已保存的方案名称 | Scheme rename: Edit saved scheme names |
| 方案删除：移除不需要的配置 | Scheme delete: Remove unnecessary configurations |
| 自动生成脚本：保存方案时自动生成 sh 启动脚本 | Auto-generate scripts: Automatic sh startup script generation |
| 本地存储：方案数据保存在浏览器 localStorage | Local storage: Scheme data saved in browser localStorage |

### 命令系统 | Command System

| 中文 | English |
|------|---------|
| 快速参数：在 vLLM serve 之前执行的 export 环境变量 | Quick parameters: Export environment variables before vLLM serve |
| 自定义参数：添加任意 vLLM 命令行参数 | Custom parameters: Add arbitrary vLLM command line parameters |
| 命令预览：实时显示生成的完整命令 | Command preview: Real-time display of generated full command |
| 环境变量导出：支持 CUDA_VISIBLE_DEVICES、NCCL 等 | Environment variable export: Support CUDA_VISIBLE_DEVICES, NCCL, etc. |

---

## 系统要求 | System Requirements

### 中文

- **Windows**：Windows 10/11（已安装 WSL/WSL2）
- **Linux**：Ubuntu 18.04+
- **硬件**：支持 CUDA 的 NVIDIA GPU，至少 16GB 显存
- **软件**：
  - Python 3.10+
  - Conda 环境（已安装 vLLM）
  - 现代 Web 浏览器（Chrome、Firefox、Edge）
  - nvidia-smi（GPU 监控需要）

### English

- **Windows**: Windows 10/11 (with WSL/WSL2 installed)
- **Linux**: Ubuntu 18.04+
- **Hardware**: NVIDIA GPU with CUDA support, at least 16GB VRAM
- **Software**:
  - Python 3.10+
  - Conda environment (with vLLM installed)
  - Modern web browser (Chrome, Firefox, Edge)
  - nvidia-smi (required for GPU monitoring)

---

## 安装 | Installation

```bash
# 克隆仓库 | Clone the repository
git clone https://github.com/wuwenthink/VLLM-GUI.git
cd VLLM-GUI

# 安装依赖 | Install dependencies
pip install -r requirements.txt
```

---

## 使用方法 | Usage

### 启动服务器 | Start Server

**Windows（使用批处理脚本 | using batch script）：**
```batch
.\启动服务.bat   .\start.bat

.\启动服务.sh   .\start.sh
```

**命令行 | Command line：**
```bash
python vllm_server.py
```

**WSL/Linux：**
```bash
python vllm_server.py
```

服务器启动后会自动在默认浏览器中打开 `http://localhost:5000`。
Server will automatically open `http://localhost:5000` in your default browser.

### 配置 vLLM | Configure vLLM

| 步骤 | Step |
|------|------|
| 1. **环境标签页**：选择运行模式，WSL / Linux，设置 Conda 环境 | 1. **Environment Tab**: Select run mode, WSL / Linux, set Conda environment |
| 2. **GPU 设置**：设置张量并行大小，配置 GPU 内存利用率 | 2. **GPU Settings**: Set tensor parallel size, configure GPU memory utilization |
| 3. **模型标签页**：输入模型路径，选择量化类型和数据类型 | 3. **Model Tab**: Enter model path, select quantization and data type |
| 4. **推理标签页**：设置服务端口，调整 GPU 内存利用率 | 4. **Inference Tab**: Set service port, adjust GPU memory utilization |
| 5. **高级标签页**：启用前缀缓存、分块预fill等高级选项 | 5. **Advanced Tab**: Enable prefix caching, chunked prefill, etc. |
| 6. **命令区域**：添加自定义 export 环境变量 | 6. **Command Area**: Add custom export environment variables |
| 7. **操作按钮**：生成命令、运行、停止、保存 | 7. **Action Buttons**: Generate, Run, Stop, Save |

### 方案管理 | Scheme Management

| 中文 | English |
|------|---------|
| **保存方案**：点击保存按钮，输入方案名称 | **Save Scheme**: Click "Save" button, enter scheme name |
| **加载方案**：从列表中选择已保存的方案 | **Load Scheme**: Choose saved scheme from list |
| **编辑方案**：点击编辑按钮修改方案名称 | **Edit Scheme**: Click edit button to rename scheme |
| **删除方案**：点击删除按钮移除配置 | **Delete Scheme**: Click delete button to remove |

### 终端输出 | Terminal Output

| 中文 | English |
|------|---------|
| 实时显示 vLLM 启动日志 | Real-time vLLM startup logs |
| GPU 状态监控 | GPU status monitoring |
| 推理进度显示 | Inference progress display |
| 支持清空终端内容 | Support for clearing terminal content |
| 自动滚动到最新输出 | Auto-scroll to latest output |

---

## 项目结构 | Project Structure

```
.
├── vllm_complete.html              # 完整 Web GUI（HTML/CSS/JS）| Complete web GUI (HTML/CSS/JS)
├── vllm_server.py                  # Flask 后端，支持 WebSocket | Flask backend with WebSocket
├── 启动服务.bat                     # Windows 批处理启动脚本 | Windows batch startup script
├── 启动服务.sh                     # Linux/WSL Shell 启动脚本 | Linux/WSL shell startup script
├── requirements.txt                # Python 依赖 | Python dependencies
├── README.md                       # 本文件 | This file
├── test_vllm_gui.py               # 测试套件（29 个测试）| Test suite (29 tests)
├── .gitignore                     # Git 忽略规则 | Git ignore rules
└── AGENTS.md                     # 开发指南 | Development guide
```

---

## API 接口 | API Endpoints

### REST API

| 端点 | 方法 | 中文描述 | English Description |
|------|------|----------|---------------------|
| `/` | GET | 返回 Web 界面 | Serve Web UI (vllm_complete.html) |
| `/api/health` | GET | 健康检查，返回运行状态 | Health check, returns running status |
| `/api/generate-command` | POST | 根据配置生成 vLLM 命令 | Generate vLLM command from config |
| `/api/run` | POST | 启动 vLLM 服务器 | Start vLLM server with command |
| `/api/stop` | POST | 停止运行的 vLLM 服务器 | Stop running VLLM server |
| `/api/save-script` | POST | 保存 sh 启动脚本到项目目录 | Save sh startup script to project dir |
| `/api/logs` | GET | 获取最近 500 行日志 | Retrieve last 500 log lines |
| `/api/clear-logs` | POST | 清空日志文件 | Clear log file |
| `/api/gpu-status` | GET | 通过 nvidia-smi 获取 GPU 状态 | Get GPU status via nvidia-smi |
| `/api/nvitop` | GET | 获取 nvitop 输出 | Get nvitop output stream |

### WebSocket 事件 | WebSocket Events

| 事件 | 方向 | 中文描述 | English Description |
|------|------|----------|---------------------|
| `connect` | Client→Server | 客户端连接 WebSocket | Client connects to WebSocket |
| `status` | Server→Client | 状态更新（运行中、已停止、错误）| Status updates (running, stopped, error) |
| `logs` | Server→Client | 终端输出流 | Terminal output stream |
| `gpu` | Server→Client | GPU 状态轮询结果 | GPU status polling results |
| `nvitop` | Server→Client | nvitop 监控输出 | nvitop monitoring output |

---

## 配置选项 | Configuration Options

### 环境变量 | Environment Variables

| 变量 | 默认值 | 中文描述 | English Description |
|------|--------|----------|---------------------|
| CUDA_VISIBLE_DEVICES | 0 | GPU 设备 ID，支持多卡如 0,1 | GPU device ID, supports multi-GPU like 0,1 |
| CUDA_DEVICE_ORDER | PCI_BUS_ID | GPU 排序方式 | GPU sorting method |
| NCCL_CUMEM_ENABLE | 0 | NCCL 集体内存优化 | NCCL collective memory optimization |
| OMP_NUM_THREADS | CPU 核心数 | OpenMP 线程数 | OpenMP thread count |

### vLLM 参数 | vLLM Parameters

| 参数 | 默认值 | 中文描述 | English Description |
|------|--------|----------|---------------------|
| tensor-parallel-size | 1 | 张量并行使用的 GPU 数量 | Number of GPUs for tensor parallelism |
| gpu-memory-utilization | 0.9 | GPU 内存分配比例 | GPU memory allocation ratio |
| max-num-seqs | 256 | 最大并发序列数 | Max concurrent sequences |
| max-num-batched-tokens | 8192 | 最大批处理令牌数 | Max batched tokens |
| max-model-len | 模型默认 | 最大序列长度 | Max sequence length |
| port | 8000 | API 服务器端口 | API server port |
| host | 0.0.0.0 | 绑定地址 | Bind address |
| dtype | auto | 数据类型 | Data type |
| quantization | - | 量化方法 | Quantization method |
| trust-remote-code | false | 信任远程代码 | Trust remote code |
| enable-prefix-caching | false | 启用前缀缓存 | Enable prefix caching |
| enable-chunked-prefill | false | 启用分块预填充 | Enable chunked prefill |
| async-scheduling | false | 启用异步调度 | Enable async scheduling |

---

## 测试 | Testing

```bash
# 运行所有测试 | Run all tests
python -m pytest test_vllm_gui.py -v

# 运行单个测试 | Run single test
python -m pytest test_vllm_gui.py::test_generate_command -v

# 运行并显示覆盖率报告 | Run with coverage report
python -m pytest --cov=. --cov-report=term-missing
```

**测试结果 | Test Results**: 29 个测试全部通过 | 29 tests passed

---

## 常见问题 | Common Issues

### Q: 双卡并行不生效？| Multi-GPU parallel not working?

**A 确保 | Ensure：**
1. `CUDA_VISIBLE_DEVICES` 设置为 0,1
2. `tensor-parallel-size` 设置为 2
3. 两张卡都有足够的显存

### Q: 命令格式错误？| Command format error?

**A 检查 | Check：**
- 确保 scheme 中的参数值类型，tensorParallel 是数字而非字符串
- Ensure scheme parameter value types, tensorParallel is numeric not string

### Q: GPU 内存不足？| GPU memory insufficient?

**A 尝试 | Try：**
1. 降低 `gpu-memory-utilization`（如 0.7）
2. 减少 `max-num-seqs`（如 64）
3. 使用量化模型（FP8、MXFP4）

### Q: WSL 路径格式？| WSL path format?

**A 使用 | Use：** `/mnt/` 前缀，如 `/mnt/i/AI-Chat/models/`

---

## 最近更新 | Recent Changes

- 修复 JavaScript 中 forEach 回调 lint 错误 | Fixed forEach callback lint errors in JavaScript
- 更新项目结构文档 | Updated project structure documentation
- 添加 Python 项目的 .gitignore | Added .gitignore for Python projects
- 所有 29 个单元测试通过 | All 29 unit tests passing
- 清理临时文件 | Cleaned up temporary files
- 优化布局：GPU 状态框、按钮位置 | Fixed layout: GPU status box, button position
- 添加中英文双语文档 | Added bilingual documentation (Chinese/English)

---

## 许可证 | License

MIT License

---

## Star 历史 | Star History

[![Star History Chart](https://api.star-history.com/svg?repos=wuwenthink/VLLM-GUI&type=Date)](https://star-history.com/#wuwenthink/VLLM-GUI&Date)
