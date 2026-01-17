#!/usr/bin/env python3
"""
Test suite for VLLM GUI application.

Tests cover:
- Path normalization for WSL mount points
- Configuration validation
- Command generation for WSL and Linux environments
- VLLMController methods with mocked subprocess calls
"""

import os
import sys
import subprocess
import tempfile
from unittest.mock import MagicMock, patch
import pytest

# Add the current directory to Python path to import vllm_server
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vllm_server import (
    _normalize_wsl_path,
    validate_config,
    VLLMController,
    Logger
)


class TestNormalizeWslPath:
    """Test _normalize_wsl_path function."""
    
    def test_non_mnt_path_returns_unchanged(self):
        """Paths not starting with /mnt/ should be returned unchanged."""
        assert _normalize_wsl_path("/home/user/model") == "/home/user/model"
        assert _normalize_wsl_path("relative/path") == "relative/path"
        assert _normalize_wsl_path("") == ""
    
    def test_existing_path_returns_unchanged(self, mocker):
        """If path already exists, return unchanged."""
        mocker.patch('os.path.exists', return_value=True)
        result = _normalize_wsl_path("/mnt/i/AI-Chat/models/llama")
        assert result == "/mnt/i/AI-Chat/models/llama"
    
    def test_path_mapping_success(self, mocker):
        """Test successful mapping from /mnt/i/ to /mnt/AI-Acer4T/."""
        # Mock os.path.exists to simulate mapping
        def mock_exists(path):
            if path == "/mnt/AI-Acer4T/AI-Chat/models/llama":
                return True
            return False
        
        mocker.patch('os.path.exists', side_effect=mock_exists)
        result = _normalize_wsl_path("/mnt/i/AI-Chat/models/llama")
        assert result == "/mnt/AI-Acer4T/AI-Chat/models/llama"
    
    def test_path_mapping_fallback(self, mocker):
        """Test fallback when no mapping works."""
        mocker.patch('os.path.exists', return_value=False)
        # Mock os.listdir to return empty list
        mocker.patch('os.listdir', return_value=[])
        
        result = _normalize_wsl_path("/mnt/i/AI-Chat/models/llama")
        # Should return original path when no mapping found
        assert result == "/mnt/i/AI-Chat/models/llama"
    
    def test_other_drive_mappings(self, mocker):
        """Test mappings for other drives (c, d, e)."""
        # Mock exists to return True for mapped path
        def mock_exists(path):
            return path == "/mnt/c/Windows/System32"
        
        mocker.patch('os.path.exists', side_effect=mock_exists)
        result = _normalize_wsl_path("/mnt/c/Windows/System32")
        assert result == "/mnt/c/Windows/System32"
    
    def test_auto_detect_mount_point(self, mocker):
        """Test automatic detection of mount points."""
        # Mock exists to return False for original, True for detected
        def mock_exists(path):
            if path == "/mnt/AI-Acer4T/AI-Chat/models/llama":
                return True
            return False
        
        mocker.patch('os.path.exists', side_effect=mock_exists)
        # Mock listdir to return our mount point
        mocker.patch('os.listdir', return_value=['AI-Acer4T', 'c', 'd'])
        
        result = _normalize_wsl_path("/mnt/i/AI-Chat/models/llama")
        assert result == "/mnt/AI-Acer4T/AI-Chat/models/llama"


class TestValidateConfig:
    """Test validate_config function."""
    
    def test_valid_config(self):
        """Test valid configuration passes validation."""
        config = {
            "modelPath": "/mnt/i/AI-Chat/models/llama",
            "condaEnv": "vllm",
            "port": "8000",
            "cudaDevices": "0",
            "tensorParallel": "1",
            "gpuMemoryUtil": "0.9",
            "customParams": []
        }
        valid, error = validate_config(config)
        assert valid is True
        assert error == ""
    
    def test_empty_model_path(self):
        """Empty model path should fail."""
        config = {"modelPath": ""}
        valid, error = validate_config(config)
        assert valid is False
        assert "模型路径不能为空" in error
    
    def test_path_traversal_attack(self):
        """Path traversal attempts should be blocked."""
        config = {"modelPath": "../../etc/passwd"}
        valid, error = validate_config(config)
        assert valid is False
        assert "无效的模型路径" in error
    
    def test_invalid_conda_env_name(self):
        """Invalid conda environment name should fail."""
        config = {
            "modelPath": "/mnt/i/model",
            "condaEnv": "invalid@name"
        }
        valid, error = validate_config(config)
        assert valid is False
        assert "Conda环境名称只能包含字母、数字、下划线、点和连字符" in error
    
    def test_invalid_port(self):
        """Invalid port numbers should fail."""
        for port in ["0", "70000", "not-a-number"]:
            config = {"modelPath": "/mnt/i/model", "port": port}
            valid, error = validate_config(config)
            assert valid is False
            assert "端口号必须在1-65535之间" in error
    
    def test_invalid_cuda_devices(self):
        """Invalid CUDA device format should fail."""
        config = {
            "modelPath": "/mnt/i/model",
            "cudaDevices": "0,a,2"
        }
        valid, error = validate_config(config)
        assert valid is False
        assert "CUDA设备必须为数字或用逗号分隔的数字列表" in error
    
    def test_invalid_tensor_parallel(self):
        """Invalid tensor parallel size should fail."""
        for tp in ["0", "9", "not-a-number"]:
            config = {"modelPath": "/mnt/i/model", "tensorParallel": tp}
            valid, error = validate_config(config)
            assert valid is False
            assert "张量并行大小必须在1-8之间" in error
    
    def test_invalid_gpu_memory_util(self):
        """Invalid GPU memory utilization should fail."""
        test_cases = [
            ("0.0", "GPU内存利用率必须在0.1-1.0之间"),
            ("1.1", "GPU内存利用率必须在0.1-1.0之间"),
            ("not-a-number", "GPU内存利用率必须是数字")
        ]
        for util, expected_error in test_cases:
            config = {"modelPath": "/mnt/i/model", "gpuMemoryUtil": util}
            valid, error = validate_config(config)
            assert valid is False
            assert expected_error in error
    
    def test_invalid_custom_param_format(self):
        """Invalid custom parameter format should fail."""
        config = {
            "modelPath": "/mnt/i/model",
            "customParams": [{"name": "", "value": "test"}]
        }
        valid, error = validate_config(config)
        assert valid is False
        assert "自定义参数名称不能为空" in error
    
    def test_invalid_custom_param_name(self):
        """Invalid custom parameter name should fail."""
        config = {
            "modelPath": "/mnt/i/model",
            "customParams": [{"name": "invalid-name", "value": "test"}]
        }
        valid, error = validate_config(config)
        assert valid is False
        assert "无效的参数名称" in error


class TestGenerateCommand:
    """Test VLLMController.generate_command method."""
    
    def setup_method(self):
        """Create a mock socketio instance for controller."""
        self.mock_socketio = MagicMock()
        self.controller = VLLMController(self.mock_socketio)
    
    def test_basic_wsl_command(self):
        """Test basic WSL command generation."""
        config = {
            "envType": "wsl",
            "modelPath": "/mnt/i/AI-Chat/models/llama",
            "condaEnv": "vllm",
            "port": "8000",
            "host": "0.0.0.0",
            "gpuMemoryUtil": "0.9",
            "tensorParallel": "1",
            "cudaDevices": "0"
        }
        
        command = self.controller.generate_command(config)
        assert command
        # Should contain vllm serve with model as positional argument
        assert "vllm serve" in command
        assert "/mnt/i/AI-Chat/models/llama" in command
        # Should use conda activate
        assert "conda activate vllm" in command
        # Should use WSL bash
        assert "wsl bash -c" in command
    
    def test_basic_linux_command(self):
        """Test basic Linux command generation."""
        config = {
            "envType": "linux",
            "modelPath": "/home/user/models/llama",
            "condaEnv": "vllm",
            "port": "8000",
            "host": "0.0.0.0",
            "gpuMemoryUtil": "0.9",
            "tensorParallel": "1",
            "cudaDevices": "0"
        }
        
        command = self.controller.generate_command(config)
        assert command
        assert "vllm serve" in command
        assert "/home/user/models/llama" in command
        assert "conda activate vllm" in command
        assert "/bin/bash -c" in command
        assert "wsl" not in command
    
    def test_command_with_export_commands(self):
        """Test command generation with export commands."""
        config = {
            "envType": "wsl",
            "modelPath": "/mnt/i/model",
            "condaEnv": "vllm",
            "cudaDevices": "0,1",
            "exportCommands": [
                "export NCCL_DEBUG=INFO",
                "export OMP_NUM_THREADS=4"
            ]
        }
        
        command = self.controller.generate_command(config)
        assert command
        # Export commands should appear after conda activate
        assert "export CUDA_VISIBLE_DEVICES=0,1" in command
        assert "export NCCL_DEBUG=INFO" in command
        assert "export OMP_NUM_THREADS=4" in command
        # Verify ordering: conda activate then exports
        activate_index = command.find("conda activate vllm")
        export_cuda_index = command.find("export CUDA_VISIBLE_DEVICES")
        assert activate_index < export_cuda_index
    
    def test_command_with_custom_params(self):
        """Test command generation with custom vLLM parameters."""
        config = {
            "envType": "wsl",
            "modelPath": "/mnt/i/model",
            "condaEnv": "vllm",
            "customParams": [
                {"name": "--max-model-len", "value": "4096"},
                {"name": "--dtype", "value": "bfloat16"},
                {"name": "--enforce-eager", "isFlag": True}
            ]
        }
        
        command = self.controller.generate_command(config)
        assert command
        assert "--max-model-len 4096" in command
        assert "--dtype bfloat16" in command
        assert "--enforce-eager" in command
    
    def test_command_with_path_normalization(self, mocker):
        """Test that paths are normalized in command generation."""
        # Mock path normalization to map /mnt/i/ to /mnt/AI-Acer4T/
        mocker.patch('vllm_server._normalize_wsl_path', 
                    side_effect=lambda p: p.replace('/mnt/i/', '/mnt/AI-Acer4T/'))
        
        config = {
            "envType": "wsl",
            "modelPath": "/mnt/i/AI-Chat/models/llama",
            "condaEnv": "vllm",
            "chatTemplate": "/mnt/i/AI-Chat/templates/chat.jinja",
            "prefixCache": "/mnt/i/AI-Chat/cache",
            "customAllReduce": "/mnt/i/AI-Chat/allreduce"
        }
        
        command = self.controller.generate_command(config)
        assert command
        # All paths should be normalized
        assert "/mnt/AI-Acer4T/AI-Chat/models/llama" in command
        assert "/mnt/AI-Acer4T/AI-Chat/templates/chat.jinja" in command
        assert "/mnt/AI-Acer4T/AI-Chat/cache" in command
        assert "/mnt/AI-Acer4T/AI-Chat/allreduce" in command
    
    def test_command_with_advanced_options(self):
        """Test command generation with advanced vLLM options."""
        config = {
            "envType": "wsl",
            "modelPath": "/mnt/i/model",
            "condaEnv": "vllm",
            "enablePrefixCaching": True,
            "enableChunked": True,
            "trustRemoteCode": True,
            "enableExpertParallel": True,
            "enableAutoToolChoice": True,
            "asyncScheduling": True
        }
        
        command = self.controller.generate_command(config)
        assert command
        assert "--enable-prefix-caching" in command
        assert "--enable-chunked-prefill" in command
        assert "--trust-remote-code" in command
        assert "--enable-expert-parallel" in command
        assert "--enable-auto-tool-choice" in command
        assert "--async-scheduling" in command
    
    def test_invalid_config_still_generates_command(self):
        """Invalid configuration should still generate command (with validation warning).
        
        Per 优化项5: Even with invalid parameters, command should be generated
        (just log warning, don't block command generation).
        """
        config = {
            "envType": "wsl",
            "modelPath": "",  # Empty model path - should log warning but still generate command
            "condaEnv": "vllm"
        }
        
        command = self.controller.generate_command(config)
        # Command should still be generated (with empty model path placeholder)
        assert command != ""
        assert "wsl bash -c" in command
        assert "vllm serve" in command


class TestVLLMControllerRunCommand:
    """Test VLLMController.run_command method with mocked subprocess."""
    
    def setup_method(self):
        self.mock_socketio = MagicMock()
        self.controller = VLLMController(self.mock_socketio)
    
    @patch('threading.Thread')
    @patch('subprocess.Popen')
    @patch('vllm_server._wsl_command_exists', return_value=True)
    def test_run_wsl_command(self, mock_wsl_exists, mock_popen, mock_thread):
        """Test running WSL command with mocked subprocess."""
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_popen.return_value = mock_process
        
        # Mock threading.Thread to prevent background thread from running
        mock_thread_instance = MagicMock()
        mock_thread.return_value = mock_thread_instance
        
        command = 'wsl bash -c "conda activate vllm && vllm serve /mnt/i/model"'
        self.controller.run_command(command, "wsl")
        
        # Verify subprocess.Popen was called
        assert mock_popen.called
        # Verify status was emitted
        self.mock_socketio.emit.assert_any_call("status", {"running": True, "pid": 12345})
        # Verify is_running is True (thread hasn't run yet due to mocking)
        assert self.controller.is_running is True
    
    @patch('threading.Thread')
    @patch('subprocess.Popen')
    def test_run_linux_command(self, mock_popen, mock_thread):
        """Test running Linux command with mocked subprocess."""
        mock_process = MagicMock()
        mock_process.pid = 54321
        mock_popen.return_value = mock_process
        
        # Mock threading.Thread to prevent background thread from running
        mock_thread_instance = MagicMock()
        mock_thread.return_value = mock_thread_instance
        
        command = '/bin/bash -c "conda activate vllm && vllm serve /home/user/model"'
        self.controller.run_command(command, "linux")
        
        assert mock_popen.called
        self.mock_socketio.emit.assert_any_call("status", {"running": True, "pid": 54321})
        assert self.controller.is_running is True
    
    @patch('threading.Thread')
    @patch('subprocess.Popen')
    @patch('vllm_server._wsl_command_exists', return_value=True)
    def test_run_command_failure(self, mock_wsl_exists, mock_popen, mock_thread):
        """Test command execution failure handling."""
        mock_popen.side_effect = subprocess.SubprocessError("Subprocess error")
        
        # Mock threading.Thread to ensure it's not started (should not be called due to exception)
        mock_thread_instance = MagicMock()
        mock_thread.return_value = mock_thread_instance
        
        command = 'wsl bash -c "conda activate vllm && vllm serve /mnt/i/model"'
        self.controller.run_command(command, "wsl")
        
        # Verify error status was emitted
        self.mock_socketio.emit.assert_any_call("status", {"running": False, "error": "Subprocess error"})


class TestVLLMControllerStop:
    """Test VLLMController.stop method."""
    
    def setup_method(self):
        self.mock_socketio = MagicMock()
        self.controller = VLLMController(self.mock_socketio)
    
    @patch('subprocess.run')
    @patch('subprocess.Popen')
    def test_stop_windows_process(self, mock_popen, mock_run):
        """Test stopping process on Windows."""
        # Mock Windows environment
        with patch('vllm_server.IS_WINDOWS', True):
            mock_process = MagicMock()
            mock_process.pid = 12345
            self.controller.process = mock_process
            self.controller.is_running = True
            
            self.controller.stop()
            
            # Verify Windows termination command
            mock_run.assert_any_call(["taskkill", "/F", "/T", "/PID", str(mock_process.pid)], shell=False, capture_output=True)
            self.mock_socketio.emit.assert_any_call("status", {"running": False})
            assert self.controller.is_running is False
    
    @patch('subprocess.run')
    @patch('subprocess.Popen')
    def test_stop_linux_process(self, mock_popen, mock_run):
        """Test stopping process on Linux."""
        with patch('vllm_server.IS_WINDOWS', False):
            mock_process = MagicMock()
            mock_process.pid = 12345
            self.controller.process = mock_process
            self.controller.is_running = True
            
            self.controller.stop()
            
            # Verify Linux termination commands
            mock_run.assert_any_call(["pkill", "-9", "-P", str(mock_process.pid)], shell=False, capture_output=True)
            mock_run.assert_any_call(["kill", "-9", str(mock_process.pid)], shell=False, capture_output=True)
            self.mock_socketio.emit.assert_any_call("status", {"running": False})
            assert self.controller.is_running is False
    
    def test_stop_no_process(self):
        """Test stop when no process is running."""
        self.controller.process = None
        self.controller.is_running = False
        
        # Should not crash
        self.controller.stop()
        # Should not emit status when already stopped
        self.mock_socketio.emit.assert_not_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])