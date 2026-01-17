# VLLM-GUI

A cross-platform web-based GUI tool for configuring and running vLLM inference server, with support for WSL/Windows/Linux environments.

## Features

### Environment Configuration
- **Multi-environment support**: WSL, WSL2, Linux native mode with auto-detection
- **Conda environment management**: Automatic activation of specified Conda environments
- **GPU device selection**: Configure GPUs via CUDA_VISIBLE_DEVICES
- **Tensor parallelism**: Support for multi-GPU parallel inference (tensor-parallel-size)

### Model Configuration
- **Model path**: Support for local paths and Windows mounted paths (/mnt/)
- **Quantization types**: FP8, MXFP4, AWQ, GPTQ support
- **Data types**: bf16, fp16, auto
- **Max sequence length**: Custom max-model-len
- **Chat template**: Custom jinja template path support
- **Trust remote code**: trust-remote-code option

### Inference Settings
- **Tensor parallel size**: 1-8 GPU configuration
- **GPU memory utilization**: 0.1-1.0 adjustable
- **Max concurrent sequences**: Control batch size
- **Max batched tokens**: Fine-grained batch control
- **Service port**: Custom API server port
- **Service model name**: OpenAI-compatible model naming

### Advanced Options
- **Prefix caching**: Accelerate repeated requests
- **Chunked prefill**: Optimize long sequence processing
- **Async scheduling**: Improve high-concurrency performance
- **Auto tool selection**: Enable ReAct-style tool calling
- **Tool call parser**: openai, Outlines, etc.
- **推理解析器**: openai_gptoss, etc.

### Real-time Monitoring
- **GPU status**: Real-time monitoring via nvidia-smi
- **nvitop integration**: Detailed GPU process and memory monitoring
- **WebSocket logs**: Real-time terminal output stream
- **Error handling**: Automatic capture and display of vLLM errors

### Configuration Management
- **Scheme save**: Save current configuration as named schemes
- **Scheme load**: Quick switching between model configurations
- **Scheme rename**: Edit saved scheme names
- **Scheme delete**: Remove unnecessary configurations
- **Auto-generate scripts**: Automatic sh startup script generation
- **Local storage**: Scheme data saved in browser localStorage

### Command System
- **Quick parameters**: Export environment variables before vLLM serve
- **Custom parameters**: Add arbitrary vLLM command line parameters
- **Command preview**: Real-time display of generated full command
- **Environment variable export**: Support CUDA_VISIBLE_DEVICES, NCCL, etc.

## System Requirements

- **Windows**: Windows 10/11 (with WSL/WSL2 installed)
- **Linux**: Ubuntu 18.04+
- **Hardware**: NVIDIA GPU with CUDA support, at least 16GB VRAM
- **Software**:
  - Python 3.10+
  - Conda environment (with vLLM installed)
  - Modern web browser (Chrome, Firefox, Edge)
  - nvidia-smi (required for GPU monitoring)

## Installation

```bash
# Clone the repository
git clone https://github.com/wuwenthink/VLLM-GUI.git
cd VLLM-GUI

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Start Server

**Windows (using batch script):**
```batch
.\启动服务.bat
```

**Command line:**
```bash
python vllm_server.py
```

**WSL/Linux:**
```bash
python vllm_server.py
```

Server will automatically open `http://localhost:5000` in your default browser.

### Configure vLLM

1. **Environment Tab**
   - Select run mode: WSL / Linux
   - Set WSL path (default: wsl)
   - Set Conda environment name (default: vllm)
   - Configure CUDA devices (default: 0, can set 0,1 for multi-GPU)

2. **GPU Settings**
   - Set tensor parallel size (tensor-parallel-size)
   - Configure GPU memory utilization

3. **Model Tab**
   - Enter model path (supports local or /mnt/Windows paths)
   - Select quantization type (FP8, MXFP4, AWQ, etc.)
   - Select data type (bf16, fp16, auto)
   - Set max model length
   - Configure service model name
   - Set chat template path
   - Enable trust remote code

4. **Inference Tab**
   - Set service port (default: 8000)
   - Adjust GPU memory utilization (default: 0.9)
   - Set max concurrent sequences (default: 256)
   - Enable/disable prefix caching
   - Enable/disable chunked prefill
   - Set max batched tokens

5. **Advanced Tab**
   - Enable expert parallel (enable-expert-parallel)
   - Enable auto tool choice (enable-auto-tool-choice)
   - Enable async scheduling (async-scheduling)
   - Select tool call parser
   - Select inference parser
   - Set prefix cache directory
   - Configure custom all-reduce

6. **Command Area (Bottom)**
   - Add custom export environment variables
   - Up to 20 parameters supported
   - Supports pure identifier parameters (e.g., --enforce-eager)

7. **Action Buttons**
   - Generate command: Preview full command to execute
   - Run: Start vLLM server
   - Stop: Stop running server
   - Save: Save current configuration as a scheme

### Scheme Management

1. **Save Scheme**
   - Click "Save" button
   - Enter scheme name
   - Auto-generate sh startup script to project directory

2. **Load Scheme**
   - Click "Select Configuration Scheme"
   - Choose scheme from list
   - Configuration auto-restores to interface

3. **Edit Scheme**
   - Click edit button next to scheme
   - Enter new scheme name
   - Save modifications

4. **Delete Scheme**
   - Click delete button next to scheme
   - Confirm deletion operation

### Terminal Output

- Real-time vLLM startup logs
- GPU status monitoring
- Inference progress display
- Support for clearing terminal content
- Auto-scroll to latest output

## Project Structure

```
.
├── vllm_complete.html              # Complete web GUI (HTML/CSS/JS)
├── vllm_server.py                  # Flask backend with WebSocket support
├── 启动服务.bat                     # Windows batch startup script
├── 启动服务.sh                     # Linux/WSL shell startup script
├── requirements.txt                # Python dependencies
├── README.md                       # This file
├── test_vllm_gui.py               # Test suite (29 tests)
├── .gitignore                     # Git ignore rules
└── AGENTS.md                      # Development guide
```

## API Endpoints

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serve Web UI (vllm_complete.html) |
| `/api/health` | GET | Health check, returns running status |
| `/api/generate-command` | POST | Generate vLLM command from config |
| `/api/run` | POST | Start vLLM server with command |
| `/api/stop` | POST | Stop running VLLM server |
| `/api/save-script` | POST | Save sh startup script to project dir |
| `/api/logs` | GET | Retrieve last 500 log lines |
| `/api/clear-logs` | POST | Clear log file |
| `/api/gpu-status` | GET | Get GPU status via nvidia-smi |
| `/api/nvitop` | GET | Get nvitop output stream |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connect` | Client→Server | Client connects to WebSocket |
| `status` | Server→Client | Status updates (running, stopped, error) |
| `logs` | Server→Client | Terminal output stream |
| `gpu` | Server→Client | GPU status polling results |
| `nvitop` | Server→Client | nvitop monitoring output |

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| CUDA_VISIBLE_DEVICES | 0 | GPU device ID, supports multi-GPU like 0,1 |
| CUDA_DEVICE_ORDER | PCI_BUS_ID | GPU sorting method |
| NCCL_CUMEM_ENABLE | 0 | NCCL collective memory optimization |
| OMP_NUM_THREADS | CPU cores | OpenMP thread count |

### vLLM Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| tensor-parallel-size | 1 | Number of GPUs for tensor parallelism |
| gpu-memory-utilization | 0.9 | GPU memory allocation ratio |
| max-num-seqs | 256 | Max concurrent sequences |
| max-num-batched-tokens | 8192 | Max batched tokens |
| max-model-len | Model default | Max sequence length |
| port | 8000 | API server port |
| host | 0.0.0.0 | Bind address |
| dtype | auto | Data type |
| quantization | - | Quantization method |
| trust-remote-code | false | Trust remote code |
| enable-prefix-caching | false | Enable prefix caching |
| enable-chunked-prefill | false | Enable chunked prefill |
| async-scheduling | false | Enable async scheduling |

## Testing

```bash
# Run all tests
python -m pytest test_vllm_gui.py -v

# Run single test
python -m pytest test_vllm_gui.py::test_generate_command -v

# Run with coverage report
python -m pytest --cov=. --cov-report=term-missing
```

**Test Results**: 29 tests passed

## Common Issues

### Q: Multi-GPU parallel not working?
A: Ensure:
1. CUDA_VISIBLE_DEVICES set to 0,1
2. tensor-parallel-size set to 2
3. Both GPUs have sufficient VRAM

### Q: Command format error?
A: Check scheme parameter value types, ensure tensorParallel is numeric not string.

### Q: GPU memory insufficient?
A: Try:
1. Lower gpu-memory-utilization (e.g., 0.7)
2. Reduce max-num-seqs (e.g., 64)
3. Use quantized model (FP8, MXFP4)

### Q: WSL path format?
A: Use /mnt/ prefix, e.g., /mnt/i/AI-Chat/models/

## Recent Changes

- Fixed forEach callback lint errors in JavaScript
- Updated project structure documentation
- Added .gitignore for Python projects
- All 29 unit tests passing
- Cleaned up temporary files from git tracking

## License

MIT License
