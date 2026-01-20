
            // Global state
            let currentEnv = 'wsl';
            let currentCondaPath = '';  // Initialize with default value
            let customParams = [];
            let currentScheme = null;
            let schemes = [];
            let process = null;
            let isRunning = false;
            let socket = null;
            let saveSchemeTab = 'new';
            
            // Initialize schemes from server
            (async function loadSchemesFromServer() {
                try {
                    const response = await fetch('/api/schemes');
                    if (response.ok) {
                        const data = await response.json();
                        schemes = data.schemes || [];
                        updateSchemeList();
                        console.log(`Loaded ${schemes.length} schemes from server`);
                    }
                } catch (e) {
                    console.log('Could not load schemes from server:', e);
                    schemes = [];
                }
            })();
        
        // Initialize environment and conda detection
        (async function initEnvironment() {
            try {
                // Detect environment via API
                const envResponse = await fetch('/api/detect-environment');
                if (envResponse.ok) {
                    const envData = await envResponse.json();
                    currentEnv = envData.environment || 'linux';
                    document.querySelectorAll('.env-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.env === currentEnv);
                    });
                    console.log(`Detected environment: ${currentEnv}`);
                }
                
                // Detect conda path
                const condaResponse = await fetch('/api/detect-conda');
                if (condaResponse.ok) {
                    const condaData = await condaResponse.json();
                    currentCondaPath = condaData.conda_path;
                    console.log(`Detected conda path: ${currentCondaPath}`);
                    // Update conda path input if it exists
                    const condaPathInput = document.getElementById('condaPath');
                    if (condaPathInput && !condaPathInput.value) {
                        condaPathInput.value = currentCondaPath;
                    }
                }
            } catch (e) {
                console.log('Could not detect conda from server:', e);
            }
        })();
        
        const log = (message, type = 'info') => {
            const terminal = document.getElementById('terminalOutput');
            const line = document.createElement('div');
            line.className = `terminal-line ${type} new-line`;
            line.textContent = message;
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;

            setTimeout(() => {
                line.classList.remove('new-line');
            }, 2000);
        };

        const showToast = (message, type = 'info') => {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i> ${message}`;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = 'toastOut 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards';
                setTimeout(() => toast.remove(), 400);
            }, 3000);
        };

        const switchTab = (element, tabName) => {
            document.querySelectorAll('.panel-tab').forEach(tab => { tab.classList.remove('active'); });
            document.querySelectorAll('.tab-pane').forEach(pane => { pane.classList.remove('active'); });
            element.classList.add('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');
        };

        const selectEnv = (env) => {
            currentEnv = env;
            document.querySelectorAll('.env-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.env === env);
            });
            // Linux环境下隐藏WSL路径设置
            const wslPathRow = document.getElementById('wslPathRow');
            if (wslPathRow) {
                wslPathRow.style.display = env === 'linux' ? 'none' : 'flex';
            }
            log(`切换到${env === 'wsl' ? 'WSL' : 'Linux'}环境`, 'info');
        };

        const validateInput = (input, hintId) => {
            const hint = document.getElementById(hintId);
            if (!hint) return;
            
            const value = input.value.trim();
            if (!value) {
                hint.className = 'param-hint';
                hint.textContent = '';
                return;
            }
            
            // Conda环境名验证
            if (input.id === 'condaEnv') {
                if (/^[a-zA-Z0-9_.-]+$/.test(value)) {
                    hint.className = 'param-hint valid';
                    hint.textContent = '✓ 环境名称格式正确';
                } else {
                    hint.className = 'param-hint error';
                    hint.textContent = '❌ 只能包含字母、数字、下划线、点和横线';
                }
                return;
            }
            
            // 路径验证
            if (input.id === 'modelPath') {
                if (value.includes('/mnt/') || value.includes('~') || value.startsWith('/')) {
                    hint.className = 'param-hint valid';
                    hint.textContent = '✓ 路径格式正确';
                } else if (value.includes(':\\')) {
                    hint.className = 'param-hint warning';
                    hint.textContent = '⚠ Windows路径，建议使用/mnt/前缀';
                } else {
                    hint.className = 'param-hint warning';
                    hint.textContent = '⚠ 请使用绝对路径或/mnt/前缀';
                }
                return;
            }
            
            // 端口验证
            if (input.id === 'port') {
                const port = parseInt(value);
                if (port >= 1 && port <= 65535 && Number.isInteger(port)) {
                    hint.className = 'param-hint valid';
                    hint.textContent = '✓ 端口号有效';
                } else {
                    hint.className = 'param-hint error';
                    hint.textContent = '❌ 端口号必须在1-65535之间';
                }
                return;
            }
            
            // CUDA设备验证
            if (input.id === 'cudaDevices') {
                const devices = value.split(',').map(d => d.trim());
                const valid = devices.every(d => /^\d+$/.test(d));
                if (valid && devices.length > 0) {
                    hint.className = 'param-hint valid';
                    hint.textContent = `✓ 检测到 ${devices.length} 个GPU设备`;
                } else if (!value) {
                    hint.className = 'param-hint warning';
                    hint.textContent = '⚠ 将使用默认设备';
                } else {
                    hint.className = 'param-hint error';
                    hint.textContent = '❌ 格式错误，请使用0,1,2,3';
                }
                return;
            }
            
            // 默认提示
            hint.className = 'param-hint';
            hint.textContent = '';
        };

        const addCustomParam = () => {
            const container = document.getElementById('customParamsContainer');
            const row = document.createElement('div');
            row.className = 'custom-param-row';
            row.innerHTML = `
                <input type="text" placeholder="参数名 (如: --max-num-batched-tokens)" class="param-name">
                <input type="text" placeholder="参数值" class="param-value">
                <label class="flag-checkbox">
                    <input type="checkbox"> 纯标识
                </label>
                <button class="remove-param-btn" onclick="removeCustomParam(this)">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(row);
        };

        const removeCustomParam = (button) => {
            button.parentElement.remove();
        };

        const collectCustomParams = () => {
            const rows = document.querySelectorAll('#customParamsContainer .custom-param-row');
            const params = [];
            rows.forEach(row => {
                const name = row.querySelector('.param-name').value.trim();
                const value = row.querySelector('.param-value').value.trim();
                const isFlag = row.querySelector('.flag-checkbox input').checked;
                if (name) {
                    params.push({ name, value, isFlag });
                }
            });
            return params;
        };

        const collectQuickParams = () => {
            const rows = document.querySelectorAll('#gpuQuickParamsContainer .quick-param-row');
            const params = [];
            rows.forEach(row => {
                const name = row.querySelector('.quick-param-name').value.trim();
                const value = row.querySelector('.quick-param-value').value.trim();
                if (name) {
                    params.push({ name, value, isFlag: !value });
                }
            });
            return params;
        };

        const getConfig = () => {
            const isLinux = currentEnv === 'linux';
            return {
                wslPath: isLinux ? '' : (document.getElementById('wslPath').value.trim() || 'wsl'),
                condaEnv: document.getElementById('condaEnv').value.trim() || 'vllm',
                condaPath: document.getElementById('condaPath').value.trim(),
                envType: currentEnv,
                cudaDevices: document.getElementById('cudaDevices').value.trim(),
                tensorParallel: parseInt(document.getElementById('tensorParallel').value) || 1,
                pipelineParallelSize: parseInt(document.getElementById('pipelineParallelSize').value) || 1,
                modelPath: document.getElementById('modelPath').value.trim(),
                quantization: document.getElementById('quantization').value,
                dtype: document.getElementById('dtype').value,
                maxModelLen: document.getElementById('maxModelLen').value.trim(),
                host: document.getElementById('host').value.trim() || '0.0.0.0',
                port: parseInt(document.getElementById('port').value) || 8000,
                gpuMemoryUtilization: parseFloat(document.getElementById('gpuMemoryUtilization').value) || 0.9,
                maxNumSequences: parseInt(document.getElementById('maxNumSequences').value) || 256,
                maxNumBatchedTokens: parseInt(document.getElementById('maxNumBatchedTokens').value) || 8192,
                servedModelName: document.getElementById('servedModelName').value.trim(),
                chatTemplate: document.getElementById('chatTemplate').value.trim(),
                toolCallParser: document.getElementById('toolCallParser').value.trim(),
                reasoningParser: document.getElementById('reasoningParser').value.trim(),
                trustRemoteCode: document.getElementById('trustRemoteCode').checked,
                enableExpertParallel: document.getElementById('enableExpertParallel').checked,
                enableAutoToolChoice: document.getElementById('enableAutoToolChoice').checked,
                asyncScheduling: document.getElementById('asyncScheduling').checked,
                customParams: collectCustomParams(),
                quickParams: collectQuickParams()
            };
        };

        const loadConfig = (config) => {
            if (!config) return;
            const envType = config.envType || 'wsl';
            selectEnv(envType);
            document.getElementById('wslPath').value = config.wslPath || '';
            document.getElementById('condaEnv').value = config.condaEnv || '';
            document.getElementById('condaPath').value = config.condaPath || '';
            document.getElementById('cudaDevices').value = config.cudaDevices || '';
            document.getElementById('tensorParallel').value = config.tensorParallel || 1;
            document.getElementById('pipelineParallelSize').value = config.pipelineParallelSize || 1;
            document.getElementById('modelPath').value = config.modelPath || '';
            document.getElementById('quantization').value = config.quantization || '';
            document.getElementById('dtype').value = config.dtype || 'auto';
            document.getElementById('maxModelLen').value = config.maxModelLen || '';
            document.getElementById('host').value = config.host || '0.0.0.0';
            document.getElementById('port').value = config.port || 8000;
            document.getElementById('gpuMemoryUtilization').value = config.gpuMemoryUtilization || 0.9;
            document.getElementById('maxNumSequences').value = config.maxNumSequences || 256;
            document.getElementById('maxNumBatchedTokens').value = config.maxNumBatchedTokens || 8192;
            document.getElementById('servedModelName').value = config.servedModelName || '';
            document.getElementById('chatTemplate').value = config.chatTemplate || '';
            document.getElementById('toolCallParser').value = config.toolCallParser || '';
            document.getElementById('reasoningParser').value = config.reasoningParser || '';
            document.getElementById('trustRemoteCode').checked = config.trustRemoteCode || false;
            document.getElementById('enableExpertParallel').checked = config.enableExpertParallel || false;
            document.getElementById('enableAutoToolChoice').checked = config.enableAutoToolChoice || false;
            document.getElementById('asyncScheduling').checked = config.asyncScheduling || false;
            
            const container = document.getElementById('customParamsContainer');
            container.innerHTML = '';
            if (config.customParams && config.customParams.length > 0) {
                config.customParams.forEach(param => {
                    const row = document.createElement('div');
                    row.className = 'custom-param-row';
                    row.innerHTML = `
                        <input type="text" placeholder="参数名" class="param-name" value="${param.name}">
                        <input type="text" placeholder="参数值" class="param-value" value="${param.value}">
                        <label class="flag-checkbox">
                            <input type="checkbox" ${param.isFlag ? 'checked' : ''}> 纯标识
                        </label>
                        <button class="remove-param-btn" onclick="removeCustomParam(this)">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    container.appendChild(row);
                });
            } else {
                addCustomParam();
            }

            // Load quick params
            const quickContainer = document.getElementById('gpuQuickParamsContainer');
            const quickRows = quickContainer.querySelectorAll('.quick-param-row');
            const savedQuickParams = config.quickParams || [];
            quickRows.forEach((row, index) => {
                const nameInput = row.querySelector('.quick-param-name');
                const valueInput = row.querySelector('.quick-param-value');
                if (savedQuickParams[index]) {
                    const param = savedQuickParams[index];
                    nameInput.value = param.name || '';
                    valueInput.value = param.value || '';
                } else {
                    nameInput.value = '';
                    valueInput.value = '';
                }
            });

            if (config.envType) {
                selectEnv(config.envType);
            }
        };

        window.generateCommand = async (configOverride) => {
            const config = configOverride || getConfig();
            // Note: No longer validating modelPath - allow command generation even with errors
            // as requested in optimization item 5

            let command = '';
            const parts = [];

            if (currentEnv === 'wsl') {
                const wslPath = config.wslPath || 'wsl';
                // Build command to run inside WSL using conda environment's python directly
                const condaEnv = config.condaEnv || 'vllm';
                const cudaDevices = config.cudaDevices;
                
                // Build WSL command - use conda environment's python directly
                const wslCmd = [];
                
                wslCmd.push(`source /etc/profile 2>/dev/null || true`);
                wslCmd.push(`source ~/.bashrc 2>/dev/null || true`);
                
                // Use conda run to execute vLLM - this avoids hardcoding conda paths
                // The conda run command will use the conda environment's python automatically
                // We don't need to source conda.sh or use hardcoded python paths
                // Just use 'conda run -n {condaEnv} python -m vllm.entrypoints.openai.api_server'
                
                // 验证并获取有效的conda路径
                let effectiveCondaPath = '';
                try {
                    const validateResponse = await fetch('/api/validate-conda-path', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            condaPath: config.condaPath || '',
                            envType: currentEnv || 'wsl'
                        })
                    });
                    if (validateResponse.ok) {
                        const validateData = await validateResponse.json();
                        effectiveCondaPath = validateData.path || '';
                        if (!validateData.valid) {
                            console.log(validateData.message);
                            // 更新currentCondaPath为自动检测的路径
                            currentCondaPath = effectiveCondaPath;
                            // 提示用户配置中的conda路径无效
                            showToast('Conda路径已自动更新: ' + effectiveCondaPath, 'warning');
                        }
                    } else {
                        // API返回错误，使用当前检测的路径
                        console.log('API returned error, using currentCondaPath');
                        effectiveCondaPath = currentCondaPath || '';
                    }
                } catch (e) {
                    console.error('Failed to validate conda path:', e);
                    // 回退到当前检测的路径
                    effectiveCondaPath = currentCondaPath || '';
                }
                
                // 如果还是没有有效路径，尝试从用户配置或当前检测中获取
                if (!effectiveCondaPath) {
                    effectiveCondaPath = config.condaPath || currentCondaPath || '';
                }
                
                if (effectiveCondaPath) {
                    wslCmd.push(`source ${effectiveCondaPath}/etc/profile.d/conda.sh 2>/dev/null || true`);
                    // 使用source activate避免conda activate需要初始化的问题
                    wslCmd.push(`source ${effectiveCondaPath}/bin/activate ${condaEnv}`);
                } else {
                    // 如果没有condaPath，使用默认的conda activate
                    wslCmd.push(`conda activate ${condaEnv}`);
                }
                
                // Add CUDA_VISIBLE_DEVICES export AFTER setting up conda
                if (cudaDevices) {
                    wslCmd.push(`export CUDA_VISIBLE_DEVICES=${cudaDevices}`);
                }
                
                // Add quick params AFTER conda activate, BEFORE vllm serve
                const quickParams = config.quickParams || [];
                quickParams.forEach(param => {
                    if (param.name) {
                        if (param.isFlag) {
                            wslCmd.push(param.name);
                        } else if (param.value) {
                            wslCmd.push(`${param.name} ${param.value}`);
                        } else {
                            wslCmd.push(param.name);
                        }
                    }
                });
                
                // Build vLLM arguments (excluding --model which becomes positional)
                const vllmArgs = [];
                vllmArgs.push(`--host ${config.host}`);
                vllmArgs.push(`--port ${config.port}`);
                vllmArgs.push(`--tensor-parallel-size ${config.tensorParallel}`);
                if (config.pipelineParallelSize && config.pipelineParallelSize !== 1) {
                    vllmArgs.push(`--pipeline-parallel-size ${config.pipelineParallelSize}`);
                }
                vllmArgs.push(`--gpu-memory-utilization=${config.gpuMemoryUtilization}`);
                vllmArgs.push(`--max-num-seqs ${config.maxNumSequences}`);

                if (config.quantization) {
                    vllmArgs.push(`--quantization ${config.quantization}`);
                }
                if (config.dtype && config.dtype !== 'auto') {
                    vllmArgs.push(`--dtype ${config.dtype}`);
                }
                if (config.maxModelLen) {
                    vllmArgs.push(`--max-model-len ${config.maxModelLen}`);
                }
                if (config.servedModelName) {
                    vllmArgs.push(`--served-model-name ${config.servedModelName}`);
                }
                if (config.chatTemplate) {
                    vllmArgs.push(`--chat-template "${config.chatTemplate}"`);
                }
                if (config.trustRemoteCode) {
                    vllmArgs.push(`--trust-remote-code`);
                }
                if (config.enableExpertParallel) {
                    vllmArgs.push(`--enable-expert-parallel`);
                }
                if (config.enableAutoToolChoice) {
                    vllmArgs.push(`--enable-auto-tool-choice`);
                }
                if (config.asyncScheduling) {
                    vllmArgs.push(`--async-scheduling`);
                }
                if (config.toolCallParser) {
                    vllmArgs.push(`--tool-call-parser ${config.toolCallParser}`);
                }
                if (config.reasoningParser) {
                    vllmArgs.push(`--reasoning-parser ${config.reasoningParser}`);
                }

                // Add custom params
                const customParams = config.customParams || [];
                customParams.forEach(param => {
                    if (param.name) {
                        if (param.isFlag) {
                            vllmArgs.push(param.name);
                        } else if (param.value) {
                            vllmArgs.push(`${param.name} ${param.value}`);
                        } else {
                            vllmArgs.push(param.name);
                        }
                    }
                });
                
                // Build vllm serve command with model path as positional argument
                // Allow empty model path as per optimization requirement
                const modelPath = config.modelPath || '';
                let vllmServeCmd = `vllm serve "${modelPath}" ${vllmArgs.join(' ')}`;
                
                // Add the complete vLLM command as a single entry
                wslCmd.push(vllmServeCmd);
                
                // Construct full command - use && to connect setup commands, vLLM is last
                command = `${wslPath} bash -c "${wslCmd.join(' && ')}"`;
                
                parts.push(`wsl-path: ${wslPath}`);
                parts.push(`conda-env: ${condaEnv}`);
                if (cudaDevices) {
                    parts.push(`cuda-devices: ${cudaDevices}`);
                }
            } else {
                // Linux环境: 使用 /bin/bash -c 格式
                // Use empty string as default, let backend auto-detect conda path
                const condaPath = config.condaPath || currentCondaPath || '';
                const exportPart = config.cudaDevices ? `export CUDA_VISIBLE_DEVICES=${config.cudaDevices}` : '';
                
                // Build quick params
                const quickParams = config.quickParams || [];
                let quickParamsParts = [];
                quickParams.forEach(param => {
                    if (param.name) {
                        if (param.isFlag) {
                            quickParamsParts.push(param.name);
                        } else if (param.value) {
                            quickParamsParts.push(`${param.name} ${param.value}`);
                        } else {
                            quickParamsParts.push(param.name);
                        }
                    }
                });
                
                // Build vllm serve command
                // Build vLLM arguments (excluding --model which becomes positional)
                const vllmArgs = [];
                vllmArgs.push(`--host ${config.host}`);
                vllmArgs.push(`--port ${config.port}`);
                vllmArgs.push(`--tensor-parallel-size ${config.tensorParallel}`);
                if (config.pipelineParallelSize && config.pipelineParallelSize !== 1) {
                    vllmArgs.push(`--pipeline-parallel-size ${config.pipelineParallelSize}`);
                }
                vllmArgs.push(`--gpu-memory-utilization=${config.gpuMemoryUtilization}`);
                vllmArgs.push(`--max-num-seqs ${config.maxNumSequences}`);

                if (config.quantization) {
                    vllmArgs.push(`--quantization ${config.quantization}`);
                }
                if (config.dtype && config.dtype !== 'auto') {
                    vllmArgs.push(`--dtype ${config.dtype}`);
                }
                if (config.maxModelLen) {
                    vllmArgs.push(`--max-model-len ${config.maxModelLen}`);
                }
                if (config.servedModelName) {
                    vllmArgs.push(`--served-model-name ${config.servedModelName}`);
                }
                if (config.chatTemplate) {
                    vllmArgs.push(`--chat-template "${config.chatTemplate}"`);
                }
                if (config.trustRemoteCode) {
                    vllmArgs.push(`--trust-remote-code`);
                }
                if (config.enableAutoToolChoice) {
                    vllmArgs.push(`--enable-auto-tool-choice`);
                }
                if (config.asyncScheduling) {
                    vllmArgs.push(`--async-scheduling`);
                }
                if (config.toolCallParser) {
                    vllmArgs.push(`--tool-call-parser ${config.toolCallParser}`);
                }
                if (config.reasoningParser) {
                    vllmArgs.push(`--reasoning-parser ${config.reasoningParser}`);
                }

                // Add custom params
                const customParams = config.customParams || [];
                customParams.forEach(param => {
                    if (param.name) {
                        if (param.isFlag) {
                            vllmArgs.push(param.name);
                        } else if (param.value) {
                            vllmArgs.push(`${param.name} ${param.value}`);
                        } else {
                            vllmArgs.push(param.name);
                        }
                    }
                });
                
                // Build vllm serve command with model path as positional argument
                // Allow empty model path as per optimization requirement
                const modelPath = config.modelPath || '';
                let vllmCmd = `vllm serve "${modelPath}" ${vllmArgs.join(' ')}`;

                // Build complete command in single line format for subprocess
                let allParts = [];
                // Use conda run - no need for hardcoded python paths or conda activate
                
                // 验证并获取有效的conda路径
                let effectiveCondaPath = '';
                try {
                    const validateResponse = await fetch('/api/validate-conda-path', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            condaPath: config.condaPath || '',
                            envType: currentEnv || 'linux'
                        })
                    });
                    if (validateResponse.ok) {
                        const validateData = await validateResponse.json();
                        effectiveCondaPath = validateData.path || '';
                        if (!validateData.valid) {
                            console.log(validateData.message);
                            // 更新currentCondaPath为自动检测的路径
                            currentCondaPath = effectiveCondaPath;
                        }
                    } else {
                        console.log('API returned error, using currentCondaPath');
                        effectiveCondaPath = currentCondaPath || '';
                    }
                } catch (e) {
                    console.error('Failed to validate conda path:', e);
                    effectiveCondaPath = config.condaPath || currentCondaPath || '';
                }
                
                if (!effectiveCondaPath) {
                    effectiveCondaPath = config.condaPath || currentCondaPath || '';
                }
                
                if (effectiveCondaPath) {
                    allParts.push(`source ${effectiveCondaPath}/etc/profile.d/conda.sh 2>/dev/null || true`);
                    // 使用source activate避免conda activate需要初始化的问题
                    allParts.push(`source ${effectiveCondaPath}/bin/activate ${config.condaEnv}`);
                } else {
                    // 如果没有condaPath，使用默认的conda activate
                    allParts.push(`conda activate ${config.condaEnv}`);
                }
                
                if (exportPart) allParts.push(exportPart);
                allParts.push(...quickParamsParts);
                allParts.push(vllmCmd);
                
                command = `/bin/bash -c "${allParts.join(' && ')}"`;
                parts.push(`env: linux`);
                parts.push(`conda-env: ${config.condaEnv}`);
                if (config.cudaDevices) {
                    parts.push(`cuda-devices: ${config.cudaDevices}`);
                }
            }

            const previewText = `[vLLM 配置预览]
模型: ${config.modelPath}
环境: ${currentEnv === 'wsl' ? 'WSL' : 'Linux'}
端口: ${config.port}
CUDA: ${config.cudaDevices || '未设置'}
并行: ${config.tensorParallel} GPU
内存: ${config.gpuMemoryUtilization * 100}%

${command}`;

            document.getElementById('commandPreview').textContent = previewText;
            log('命令预览已更新', 'success');
            showToast('命令生成成功', 'success');
            return command;
        };

        const runCommand = async () => {
            if (isRunning) {
                showToast('服务已在运行中', 'warning');
                return;
            }

            const command = await generateCommand();
            if (!command) {
                showToast('请先生成命令', 'warning');
                return;
            }

            isRunning = true;
            document.getElementById('runningStatus').innerHTML = '<span style="color: #f59e0b;">启动中...</span>';
        document.getElementById('runningStatus').className = 'status-content running';
            document.getElementById('runningStatus').className = 'status-content running';
            document.getElementById('statusText').textContent = '运行中';
            document.getElementById('statusDot').classList.add('running');

            document.querySelectorAll('.action-buttons button').forEach(btn => {
                if (btn.classList.contains('btn-run')) {
                    btn.disabled = true;
                }
            });

            document.querySelector('.terminal-section')?.classList.add('running');
            document.querySelector('.status-box')?.classList.add('running');
            document.querySelector('.command-preview-box')?.classList.add('running');

            try {
                log('正在启动vLLM服务器...', 'info');
                log(`命令: ${command}`, 'info');
                const response = await fetch('/api/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: command,
                        envType: currentEnv,
                        wslPath: document.getElementById('wslPath').value.trim() || 'wsl'
                    })
                });

                const result = await response.json();
                if (result.success) {
                    // Don't show success yet - wait for WebSocket status update
                    // The actual startup confirmation comes from the subprocess output via WebSocket
                    log('正在等待vLLM服务器启动...', 'info');
                } else {
                    throw new Error(result.message || '启动失败');
                }
            } catch (error) {
                log(`启动失败: ${error.message}`, 'error');
                document.getElementById('runningStatus').innerHTML = '<span style="color: #ef4444; font-weight: 600;">启动失败</span>';
        document.getElementById('runningStatus').className = 'status-content error';
                document.getElementById('runningStatus').className = 'status-content error';
                document.getElementById('statusText').textContent = '错误';
                document.getElementById('statusDot').classList.remove('running');
                document.getElementById('statusDot').classList.add('error');
                showToast(`启动失败: ${error.message}`, 'error');
                isRunning = false;

                document.querySelectorAll('.action-buttons button').forEach(btn => {
                    btn.disabled = false;
                });

                document.querySelector('.terminal-section')?.classList.remove('running');
                document.querySelector('.status-box')?.classList.remove('running');
                document.querySelector('.command-preview-box')?.classList.remove('running');
            }
        };

        const stopCommand = async () => {
            if (!isRunning) {
                showToast('服务未运行', 'warning');
                return;
            }

            try {
                const response = await fetch('/api/stop', { method: 'POST' });
                const result = await response.json();

                if (result.success) {
                    log('正在停止vLLM服务器...', 'warning');
                    // Set stopping status
                    document.getElementById('runningStatus').innerHTML = '<span style="color: #f97316;">正在停止...</span>';
        document.getElementById('runningStatus').className = 'status-content stopping';
                    document.getElementById('runningStatus').className = 'status-content stopping';
                    document.getElementById('statusText').textContent = '正在停止';
                    document.getElementById('statusDot').classList.remove('running');
                    document.getElementById('statusDot').classList.add('stopping');

                    isRunning = false;
                    stopGPUPolling(); // Stop GPU monitoring

                    // After a brief delay, show stopped status
                    setTimeout(() => {
                        document.getElementById('runningStatus').innerHTML = '<span style="color: #22c55e;">已停止</span>';
        document.getElementById('runningStatus').className = 'status-content ready';
                        document.getElementById('runningStatus').className = 'status-content';
                        document.getElementById('statusText').textContent = '已停止';
                        document.getElementById('statusDot').classList.remove('stopping');
                    }, 1500);
                    showToast('服务器已停止', 'info');

                    document.querySelector('.terminal-section')?.classList.remove('running');
                    document.querySelector('.status-box')?.classList.remove('running');
                    document.querySelector('.command-preview-box')?.classList.remove('running');
                    document.getElementById('gpuStatusBox')?.classList.remove('running');

                    // 停止后恢复GPU实时监控功能（优化项#11）
                    log('正在恢复GPU状态实时监控...', 'info');
                    setTimeout(() => {
                        startGPUPolling();
                        log('GPU状态实时监控已恢复', 'success');
                    }, 1000);
                }
            } catch (error) {
                log(`停止失败: ${error.message}`, 'error');
                showToast(`停止失败: ${error.message}`, 'error');
            }

            document.querySelectorAll('.action-buttons button').forEach(btn => {
                btn.disabled = false;
            });
        };

        const clearTerminal = () => {
            document.getElementById('terminalOutput').innerHTML = '等待启动...';
            log('终端已清空', 'system');
        };

        const executeTerminalInput = async () => {
            const input = document.getElementById('terminalInput');
            const command = input.value.trim();

            if (!command) {
                showToast('请输入命令', 'warning');
                return;
            }

            // Log the command
            log(`$ ${command}`, 'input');
            input.value = '';

            // Send command to server for execution in new terminal
            try {
                const response = await fetch('/api/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command, env: currentEnv })
                });
                const result = await response.json();
                if (result.success) {
                    log(result.output, 'system');
                } else {
                    log(`命令执行失败: ${result.error}`, 'error');
                }
            } catch (error) {
                log(`命令执行失败: ${error.message}`, 'error');
            }
        };

        const showTerminalInputDialog = () => {
            document.getElementById('terminalCommandInput').value = '';
            document.getElementById('terminalInputDialog').style.display = 'flex';
        };

        const closeTerminalInputDialog = () => {
            document.getElementById('terminalInputDialog').style.display = 'none';
        };

        const closeCommandPreviewModal = () => {
            document.getElementById('commandPreviewModal').style.display = 'none';
        };

        const executeTerminalCommand = async () => {
            const command = document.getElementById('terminalCommandInput').value.trim();
            if (!command) {
                showToast('请输入命令', 'warning');
                return;
            }

            closeTerminalInputDialog();
            log(`执行命令: ${command}`, 'info');

            try {
                const response = await fetch('/api/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command, env: currentEnv })
                });
                const result = await response.json();
                if (result.success) {
                    log(result.output, 'command');
                    showToast('命令执行完成', 'success');
                } else {
                    log(`命令执行失败: ${result.error}`, 'error');
                    showToast(`执行失败: ${result.error}`, 'error');
                }
            } catch (error) {
                log(`执行失败: ${error.message}`, 'error');
                showToast(`执行失败: ${error.message}`, 'error');
            }
        };

        const generateShScript = (config, command) => {
            const modelName = config.modelPath.split('/').pop() || 'model';
            const envName = config.condaEnv || 'vllm';
            
            // Build export commands
            let exports = '';
            if (config.cudaDevices) {
                exports += `export CUDA_VISIBLE_DEVICES=${config.cudaDevices}\n`;
            }
            
            // Add quick params as exports
            const quickParams = config.quickParams || [];
            quickParams.forEach(param => {
                if (param.name && param.value) {
                    exports += `export ${param.name}=${param.value}\n`;
                }
            });
            
            // Build vllm serve command
            // Use python -m vllm.entrypoints.openai.api_server instead of 'vllm serve' for conda run compatibility
            const modelPath = config.modelPath || '';
            let vllmArgs = `python -m vllm.entrypoints.openai.api_server --model "${modelPath}"`;
            vllmArgs += ` --host ${config.host}`;
            vllmArgs += ` --port ${config.port}`;
            vllmArgs += ` --tensor-parallel-size ${config.tensorParallel}`;
            vllmArgs += ` --gpu-memory-utilization=${config.gpuMemoryUtilization}`;
            vllmArgs += ` --max-num-seqs ${config.maxNumSequences}`;
            
            if (config.quantization) vllmArgs += ` --quantization ${config.quantization}`;
            if (config.dtype && config.dtype !== 'auto') vllmArgs += ` --dtype ${config.dtype}`;
            if (config.maxModelLen) vllmArgs += ` --max-model-len ${config.maxModelLen}`;
            if (config.servedModelName) vllmArgs += ` --served-model-name ${config.servedModelName}`;
            if (config.chatTemplate) vllmArgs += ` --chat-template "${config.chatTemplate}"`;
            if (config.trustRemoteCode) vllmArgs += ` --trust-remote-code`;
            if (config.enableExpertParallel) vllmArgs += ` --enable_expert_parallel`;
            if (config.enableAutoToolChoice) vllmArgs += ` --enable-auto-tool-choice`;
            if (config.asyncScheduling) vllmArgs += ` --async-scheduling`;
            if (config.toolCallParser) vllmArgs += ` --tool-call-parser ${config.toolCallParser}`;
            if (config.reasoningParser) vllmArgs += ` --reasoning-parser ${config.reasoningParser}`;
            
            // Add custom params at the end
            const customParams = config.customParams || [];
            customParams.forEach(param => {
                if (param.name) {
                    if (param.isFlag) {
                        vllmArgs += ` ${param.name}`;
                    } else if (param.value) {
                        vllmArgs += ` ${param.name} ${param.value}`;
                    } else {
                        vllmArgs += ` ${param.name}`;
                    }
                }
            });
            
            return `#!/bin/bash
# vLLM Server Startup Script
# Generated by VLLM GUI
# Model: ${config.modelPath}
# Created: ${new Date().toLocaleString('zh-CN')}

# Set environment variables
${exports}# Use conda environment's python directly - no need for conda activate
source ~/miniconda3/etc/profile.d/conda.sh 2>/dev/null || true
PYTHON_PATH=~/miniconda3/envs/${envName}/bin/python

# Start vLLM server
echo "Starting vLLM server..."
echo "Model: ${config.modelPath}"
echo "Port: ${config.port}"
echo "Tensor Parallel: ${config.tensorParallel}"
${vllmArgs.replace('python -m', '$PYTHON_PATH -m')}
`;
        };

        // Dialog functions for save scheme modal
        const showSaveSchemeDialog = () => {
            const dialog = document.getElementById('saveSchemeDialog');
            const nameInput = document.getElementById('newSchemeName');
            const descInput = document.getElementById('newSchemeDesc');
            const overwriteSelect = document.getElementById('overwriteSchemeSelect');

            // Generate suggested name from current config
            const config = getConfig();
            let suggestedName = config.servedModelName || '';
            if (!suggestedName && config.modelPath) {
                suggestedName = config.modelPath.split('/').pop().split('\\').pop();
            }
            if (!suggestedName) {
                suggestedName = `vllm_配置_${new Date().toLocaleDateString()}`;
            }
            nameInput.value = suggestedName;
            descInput.value = '';

            // Update preview card with current config
            const modelPathEl = document.getElementById('previewModelPath');
            const gpuDeviceEl = document.getElementById('previewGpuDevice');
            const parallelEl = document.getElementById('previewParallel');
            const envEl = document.getElementById('previewEnv');

            if (modelPathEl) {
                modelPathEl.textContent = config.modelPath ?
                    (config.modelPath.length > 30 ? '...' + config.modelPath.slice(-27) : config.modelPath) : '未设置';
            }
            if (gpuDeviceEl) {
                gpuDeviceEl.textContent = config.cudaDevices || '0';
            }
            if (parallelEl) {
                parallelEl.textContent = `张量并行: ${config.tensorParallel || 1}`;
            }
            if (envEl) {
                envEl.textContent = currentEnv === 'wsl' ? 'WSL' : (currentEnv === 'linux' ? 'Linux' : currentEnv);
            }

            // Populate overwrite dropdown with existing schemes
            overwriteSelect.innerHTML = '<option value="">请选择方案</option>' +
                schemes.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

            // Reset to new tab
            switchSaveTab('new');

            dialog.style.display = 'flex';

            // Add keyboard event listener for ESC and Enter
            setTimeout(() => {
                dialog.addEventListener('keydown', handleDialogKeydown);
                nameInput?.focus();
            }, 100);
        };

        const handleDialogKeydown = (e) => {
            if (e.key === 'Escape') {
                closeSaveSchemeDialog();
            } else if (e.key === 'Enter') {
                const activeTab = document.querySelector('.dialog-tab.active')?.dataset.tab;
                if (activeTab === 'new') {
                    const name = document.getElementById('newSchemeName')?.value.trim();
                    if (name) {
                        confirmSaveScheme();
                    }
                }
            }
        };

        const handleDialogOverlayClick = (e) => {
            if (e.target.id === 'saveSchemeDialog') {
                closeSaveSchemeDialog();
            }
        };

        const closeSaveSchemeDialog = () => {
            const dialog = document.getElementById('saveSchemeDialog');
            dialog.style.display = 'none';
            // Remove keyboard event listener
            if (dialog) {
                dialog.removeEventListener('keydown', handleDialogKeydown);
            }
        };

        const switchSaveTab = (tab) => {
            document.querySelectorAll('.dialog-tab').forEach(t => { t.classList.remove('active'); });
            document.querySelectorAll('.dialog-tab-content').forEach(c => { c.classList.remove('active'); });

            const tabButton = document.querySelector(`[data-tab="${tab}"]`);
            const tabContent = document.getElementById(`saveTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
            
            if (tabButton) tabButton.classList.add('active');
            if (tabContent) tabContent.classList.add('active');
        };

        const confirmSaveScheme = async () => {
            const activeTab = document.querySelector('.dialog-tab.active').dataset.tab;

            if (activeTab === 'new') {
                const name = document.getElementById('newSchemeName').value.trim();
                const desc = document.getElementById('newSchemeDesc').value.trim();

                if (!name) {
                    showToast('请输入方案名称', 'warning');
                    return;
                }

                const config = getConfig();
                config.envType = currentEnv;

                try {
                    const response = await fetch('/api/schemes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            scheme: {
                                name: name,
                                config: config,
                                envType: currentEnv
                            }
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        // Update local schemes list
                        const existingIndex = schemes.findIndex(s => s.name === name);
                        if (existingIndex !== -1) {
                            schemes[existingIndex] = result.scheme;
                            showToast(`方案 "${name}" 已覆盖`, 'success');
                            log(`配置方案 "${name}" 已覆盖`, 'success');
                        } else {
                            schemes.push(result.scheme);
                            showToast(`方案 "${name}" 已保存`, 'success');
                            log(`配置方案 "${name}" 已保存`, 'success');
                        }
                        updateSchemeList();
                        closeSaveSchemeDialog();
                    } else {
                        showToast(result.message || '保存失败', 'error');
                    }
                } catch (e) {
                    showToast('保存失败: ' + e.message, 'error');
                }

            } else {
                // Overwrite existing scheme
                const select = document.getElementById('overwriteSchemeSelect');
                const schemeId = parseInt(select.value);

                if (!schemeId) {
                    showToast('请选择要覆盖的方案', 'warning');
                    return;
                }

                const schemeIndex = schemes.findIndex(s => s.id === schemeId);
                if (schemeIndex === -1) return;

                const config = getConfig();
                config.envType = currentEnv;

                schemes[schemeIndex] = {
                    id: schemes[schemeIndex].id,
                    name: schemes[schemeIndex].name,
                    config: config,
                    createdAt: new Date().toISOString(),
                    envType: currentEnv
                };

                updateSchemeList();
                showToast(`方案 "${schemes[schemeIndex].name}" 已更新`, 'success');
                log(`配置方案 "${schemes[schemeIndex].name}" 已更新`, 'success');
                closeSaveSchemeDialog();
            }
        };

        window.saveScheme = async () => {
            showSaveSchemeDialog();
        };

        const updateSchemeList = () => {
            const popup = document.getElementById('schemeListPopup');
            const countBadge = document.getElementById('schemeCountBadge');
            const count = schemes.length;
            
            if (countBadge) {
                countBadge.textContent = count;
                countBadge.setAttribute('data-count', count);
            }
            
            if (!popup) return;
            
            popup.innerHTML = schemes.length ? `
                <div style="padding: 12px 20px; background: rgba(102, 126, 234, 0.1); border-bottom: 2px solid rgba(102, 126, 234, 0.2); display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: #667eea; font-size: 0.9em;">
                        <i class="fas fa-layer-group"></i> 已保存的配置方案
                    </span>
                    <span style="background: var(--primary-gradient-vibrant); color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 0.8em; font-weight: 700;">
                        ${count} 个方案
                    </span>
                </div>
                ${schemes.map((scheme, index) => `
                    <div class="scheme-item" onclick="loadScheme(${scheme.id})" style="animation: fadeInUp 0.3s ease-out; animation-delay: ${index * 0.05}s; animation-fill-mode: both;">
                        <div class="scheme-item-icon">
                            <i class="fas fa-microchip"></i>
                        </div>
                        <div class="scheme-item-info">
                            <div class="scheme-item-name">${scheme.name}</div>
                            <div class="scheme-item-desc">
                                ${scheme.config.modelPath ? scheme.config.modelPath.split('/').pop().split('\\').pop() : '未配置模型'} · 
                                ${scheme.config.condaEnv || 'vllm'} · 
                                ${(scheme.envType || scheme.config.envType || 'wsl') === 'wsl' ? 'WSL' : 'Linux'}
                            </div>
                        </div>
                        <div class="scheme-item-actions">
                            <button class="scheme-action-btn" onclick="event.stopPropagation(); previewScheme(${scheme.id})" title="预览命令">
                                <i class="fas fa-eye"></i>
                                <span>预览</span>
                            </button>
                            <button class="scheme-action-btn" onclick="event.stopPropagation(); editScheme(${scheme.id})" title="重命名">
                                <i class="fas fa-pen"></i>
                                <span>重命名</span>
                            </button>
                            <button class="scheme-action-btn delete" onclick="event.stopPropagation(); deleteScheme(${scheme.id})" title="删除">
                                <i class="fas fa-trash"></i>
                                <span>删除</span>
                            </button>
                        </div>
                    </div>
                `).join('')}
            ` : '<div style="padding: 30px 20px; text-align: center; color: #64748b;"><i class="fas fa-folder-open" style="font-size: 2em; margin-bottom: 10px; opacity: 0.5;"></i><br>暂无保存的方案<br><span style="font-size: 0.85em; opacity: 0.7;">点击"保存"按钮创建配置方案</span></div>';
        };

        const loadScheme = (id) => {
            const scheme = schemes.find(s => s.id === id);
            if (scheme) {
                loadConfig(scheme.config);
                currentScheme = scheme;
                document.getElementById('schemeSelectText').innerHTML = `<i class="fas fa-check-circle"></i> ${scheme.name}`;
                document.getElementById('schemeListPopup').classList.remove('show');
                showToast(`已加载方案 "${scheme.name}"`, 'success');
                log(`加载配置方案: ${scheme.name}`, 'info');
            }
        };

        const previewScheme = async (id) => {
            const scheme = schemes.find(s => s.id === id);
            if (scheme) {
                // Temporarily set currentEnv to scheme's envType
                const originalEnv = currentEnv;
                currentEnv = scheme.envType || scheme.config.envType || 'wsl';
                
                // Generate command preview
                const command = await generateCommand(scheme.config);
                
                // Restore original env
                currentEnv = originalEnv;
                
                // Show in command preview modal with null checks
                const previewNameEl = document.getElementById('previewSchemeName');
                const previewContentEl = document.getElementById('previewCommandContent');
                const previewModalEl = document.getElementById('commandPreviewModal');
                
                if (previewNameEl) {
                    previewNameEl.innerHTML = `<i class="fas fa-eye"></i> 方案预览: ${scheme.name}`;
                }
                if (previewContentEl) {
                    previewContentEl.innerHTML = command;
                }
                if (previewModalEl) {
                    previewModalEl.style.display = 'flex';
                }
            }
        };

        const editScheme = async (id) => {
            const scheme = schemes.find(s => s.id === id);
            if (scheme) {
                const newName = prompt('请输入新方案名称:', scheme.name);
                if (newName && newName.trim()) {
                    const oldName = scheme.name;
                    scheme.name = newName.trim();
                    
                    try {
                        const response = await fetch('/api/schemes', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                scheme: {
                                    name: scheme.name,
                                    config: scheme.config,
                                    envType: scheme.envType
                                }
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            updateSchemeList();
                            if (currentScheme && currentScheme.id === id) {
                                document.getElementById('schemeSelectText').innerHTML = `<i class="fas fa-check-circle"></i> ${scheme.name}`;
                            }
                            showToast(`方案已从 "${oldName}" 重命名为 "${scheme.name}"`, 'success');
                            log(`方案 "${oldName}" 已重命名为 "${scheme.name}"`, 'success');
                        } else {
                            // Revert name on failure
                            scheme.name = oldName;
                            showToast(result.message || '重命名失败', 'error');
                        }
                    } catch (e) {
                        // Revert name on error
                        scheme.name = oldName;
                        showToast('重命名失败: ' + e.message, 'error');
                    }
                }
            }
        };

        const deleteScheme = async (id) => {
            const scheme = schemes.find(s => s.id === id);
            if (scheme && confirm(`确定要删除方案 "${scheme.name}" 吗?`)) {
                try {
                    const response = await fetch(`/api/schemes/${id}`, { method: 'DELETE' });
                    const result = await response.json();
                    
                    if (result.success) {
                        schemes = schemes.filter(s => s.id !== id);
                        updateSchemeList();
                        if (currentScheme && currentScheme.id === id) {
                            document.getElementById('schemeSelectText').innerHTML = `选择配置方案...`;
                            currentScheme = null;
                        }
                        showToast(`方案 "${scheme.name}" 已删除`, 'info');
                        log(`配置方案 "${scheme.name}" 已删除`, 'warning');
                    } else {
                        showToast(result.message || '删除失败', 'error');
                    }
                } catch (e) {
                    showToast('删除失败: ' + e.message, 'error');
                }
            }
        };

        const toggleSchemeList = () => {
            const popup = document.getElementById('schemeListPopup');
            const button = document.getElementById('currentScheme');
            
            if (popup.classList.contains('show')) {
                popup.classList.remove('show');
            } else {
                // Calculate position relative to the button
                const buttonRect = button.getBoundingClientRect();
                popup.style.top = `${buttonRect.bottom + 8}px`;
                popup.style.left = `${buttonRect.left}px`;
                popup.classList.add('show');
            }
        };

        document.addEventListener('click', (e) => {
            const popup = document.getElementById('schemeListPopup');
            const button = document.getElementById('currentScheme');
            if (!e.target.closest('#schemeListPopup') && !e.target.closest('#currentScheme')) {
                popup.classList.remove('show');
            }
        });

        window.addEventListener('beforeunload', () => {
            if (isRunning) {
                fetch('/api/stop', { method: 'POST' });
            }
        });

        let gpuPollInterval = null;
        let nvitopActive = false;

        const fetchGPUStatus = async () => {
            try {
                const response = await fetch('/api/gpu-status');
                const result = await response.json();
                const gpuGrid = document.getElementById('gpuGrid');
                
                if (result.status === 'ok' && result.gpus && result.gpus.length > 0) {
                    gpuGrid.innerHTML = result.gpus.map((gpu, index) => {
                        // Calculate memory percentage for progress bar
                        const memUsed = gpu.memory_used || 0;
                        const memTotal = gpu.memory_total || 1;
                        const memPercent = Math.round((memUsed / memTotal) * 100);
                        const utilPercent = gpu.utilization || 0;
                        
                        return `
                        <div class="gpu-item">
                            <div class="gpu-name">
                                <i class="fas fa-video"></i>
                                <span>${gpu.name || `GPU ${index}`}</span>
                            </div>
                            <div class="gpu-progress-container">
                                <div class="gpu-progress-item">
                                    <div class="gpu-progress-bar">
                                        <div class="gpu-progress-fill memory" style="width: ${memPercent}%"></div>
                                    </div>
                                    <span class="gpu-progress-label">${gpu.memory_used} / ${gpu.memory_total} MB</span>
                                </div>
                                <div class="gpu-progress-item">
                                    <div class="gpu-progress-bar">
                                        <div class="gpu-progress-fill util" style="width: ${utilPercent}%"></div>
                                    </div>
                                    <span class="gpu-progress-label">利用率: ${gpu.utilization}%</span>
                                </div>
                            </div>
                            <div class="gpu-temp">
                                <span class="gpu-label">温度</span>
                                ${gpu.temperature}°C
                            </div>
                            <div class="gpu-power">
                                <span class="gpu-label">功耗</span>
                                ${gpu.power}W
                            </div>
                            <div class="gpu-fan">
                                <span class="gpu-label">风扇</span>
                                ${gpu.fan_speed || 0}%
                            </div>
                        </div>
                        `;
                    }).join('');
                    document.getElementById('gpuStatusBox').classList.add('running');
                } else {
                    gpuGrid.innerHTML = '<div class="gpu-empty">无可用GPU信息</div>';
                    document.getElementById('gpuStatusBox').classList.remove('running');
                }
            } catch (error) {
                console.error('GPU状态获取失败:', error);
                document.getElementById('gpuGrid').innerHTML = '<div class="gpu-empty">GPU监控不可用</div>';
            }
        };

        const startGPUPolling = () => {
            fetchGPUStatus();
            gpuPollInterval = setInterval(fetchGPUStatus, 2000);
        };

        const stopGPUPolling = () => {
            if (gpuPollInterval) {
                clearInterval(gpuPollInterval);
                gpuPollInterval = null;
            }
        };

        // nvitop监控功能
        const startNvitopMonitoring = async () => {
            try {
                const response = await fetch('/api/nvitop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'start',
                        envType: currentEnv
                    })
                });
                const result = await response.json();
                if (result.status === 'started') {
                    nvitopActive = true;
                    log('nvitop监控已启动', 'success');
                }
            } catch (error) {
                log(`nvitop启动失败: ${error.message}`, 'error');
            }
        };

        const stopNvitopMonitoring = async () => {
            try {
                const response = await fetch('/api/nvitop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'stop' })
                });
                const result = await response.json();
                if (result.success) {
                    nvitopActive = false;
                    log('nvitop监控已停止', 'success');
                }
            } catch (error) {
                log(`nvitop停止失败: ${error.message}`, 'error');
            }
        };

        const initSocket = () => {
            try {
                socket = io({
                    transports: ['polling', 'websocket'],
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000
                });
                
                socket.on('connect', () => {
                    log('已连接到服务器', 'system');
                });

                socket.on('connect_error', (error) => {
                    log(`连接错误: ${error.message}`, 'error');
                });

                socket.on('disconnect', () => {
                    log('与服务器断开连接', 'error');
                });

                socket.on('log', (data) => {
                    log(data.message, data.level || 'output');
                });

                socket.on('status', (data) => {
                    if (data.running) {
                        isRunning = true;
                        const port = document.getElementById('port').value || 8000;
                        document.getElementById('runningStatus').innerHTML = `
                            <div class="running-status">
                                <span class="status-label">运行中</span>
                                <span class="port-badge">端口: ${port}</span>
                            </div>
                        `;
                        document.getElementById('runningStatus').className = 'status-content ready';
                        document.getElementById('statusText').textContent = '运行中';
                        document.getElementById('statusDot').classList.add('running');
                        document.querySelectorAll('.action-buttons button').forEach(btn => {
                            if (btn.classList.contains('btn-run')) btn.disabled = true;
                        });
                        // 服务器运行时：停止nvitop，启动GPU轮询
                        stopNvitopMonitoring();
                        startGPUPolling();
                    } else {
                        isRunning = false;
                        document.getElementById('runningStatus').innerHTML = '<span style="color: #22c55e;">已停止</span>';
                        document.getElementById('runningStatus').className = 'status-content';
                        document.getElementById('statusText').textContent = '已停止';
                        document.getElementById('statusDot').classList.remove('running');
                        document.querySelectorAll('.action-buttons button').forEach(btn => { btn.disabled = false; });
                        // 服务器停止时：停止GPU轮询，启动nvitop监控
                        stopGPUPolling();
                        startNvitopMonitoring();
                    }
                });

                // nvitop输出监听
                socket.on('nvitop', (data) => {
                    if (data.output) {
                        // 如果nvitop激活，更新GPU状态显示为nvitop输出
                        if (nvitopActive) {
                            const gpuGrid = document.getElementById('gpuGrid');
                            // 简单显示nvitop输出
                            gpuGrid.innerHTML = `<div class="gpu-item" style="grid-template-columns: 1fr; font-family: monospace; font-size: 0.8em;">${data.output}</div>`;
                        }
                    }
                });
            } catch (error) {
                log(`WebSocket初始化失败: ${error.message}`, 'error');
            }
        };

        // 退出应用程序
        const exitApplication = async () => {
            if (!confirm('确定要退出吗？这将停止所有运行中的进程并关闭浏览器。')) {
                return;
            }
            
            log('正在退出应用程序...', 'warning');
            
            try {
                // 停止vLLM服务器（如果正在运行）
                if (isRunning) {
                    await fetch('/api/stop', { method: 'POST' });
                    log('vLLM服务器已停止', 'success');
                }
                
                // 停止nvitop监控
                await stopNvitopMonitoring();
                
                // 停止GPU轮询
                stopGPUPolling();
                
                // 关闭WebSocket连接
                if (socket) {
                    socket.disconnect();
                    socket = null;
                }
                
                // 停止服务器（关闭Python进程）- 优化项#12
                try {
                    await fetch('/api/stop', { method: 'POST' });
                    log('服务器进程已停止', 'success');
                } catch (e) {
                    // 服务器可能已经停止，忽略错误
                }
                
                // 更新UI状态
                isRunning = false;
                document.getElementById('runningStatus').innerHTML = '<span style="color: #94a3b8;">已退出</span>';
        document.getElementById('runningStatus').className = 'status-content';
                document.getElementById('runningStatus').className = 'status-content error';
                document.getElementById('statusText').textContent = '已退出';
                document.getElementById('statusDot').classList.remove('running');
                document.getElementById('statusDot').classList.add('error');
                
                // 禁用操作按钮
                document.querySelectorAll('.action-buttons button').forEach(btn => {
                    btn.disabled = true;
                });
                // 启用退出按钮
                document.querySelector('.btn-exit').disabled = false;
                
                log('应用程序正在关闭...', 'success');
                
                // 关闭服务器并退出
                try {
                    await fetch('/api/shutdown', { method: 'POST' });
                } catch (e) {
                    // 服务器可能已经关闭，忽略错误
                }
                
                // 延迟关闭浏览器窗口
                setTimeout(async () => {
                    // 先尝试关闭服务器进程
                    try {
                        const response = await fetch('/api/shutdown', { method: 'POST' });
                        const result = await response.json();
                        if (result.success) {
                            log('服务器已关闭', 'success');
                        }
                    } catch (e) {
                        // 服务器可能已关闭，忽略错误
                    }
                    
                    // 尝试关闭浏览器窗口
                    try {
                        if (window.opener) {
                            window.close();
                        } else {
                            // 尝试使用 window.close()，如果失败则显示提示
                            window.open('', '_self', '');
                            window.close();
                        }
                    } catch (e) {
                        log('请手动关闭浏览器窗口', 'warning');
                    }
                }, 500);
                
            } catch (error) {
                log(`退出过程中发生错误: ${error.message}`, 'error');
            }
        };

        // ==================== 输入验证系统 ====================
        const validationRules = {
            // 模型路径：不能为空，不能包含路径遍历符号
            modelPath: {
                validate: (value) => {
                    if (!value || value.trim() === '') return { valid: false, message: '模型路径不能为空' };
                    if (value.includes('..')) return { valid: false, message: '路径不能包含..' };
                    return { valid: true, message: '有效路径' };
                },
                trigger: 'input'
            },
            // 端口号：1-65535之间的数字
            port: {
                validate: (value) => {
                    if (!value) return { valid: true, message: '使用默认端口8000' };
                    if (!/^\d+$/.test(value)) return { valid: false, message: '端口必须是数字' };
                    const portNum = parseInt(value);
                    if (portNum < 1 || portNum > 65535) return { valid: false, message: '端口必须在1-65535之间' };
                    return { valid: true, message: '有效端口' };
                },
                trigger: 'input'
            },
            // 张量并行大小：1-8之间的数字
            tensorParallel: {
                validate: (value) => {
                    if (!value) return { valid: true, message: '使用默认值1' };
                    if (!/^\d+$/.test(value)) return { valid: false, message: '必须是数字' };
                    const num = parseInt(value);
                    if (num < 1 || num > 8) return { valid: false, message: '必须在1-8之间' };
                    return { valid: true, message: '有效值' };
                },
                trigger: 'input'
            },
            // GPU内存利用率：0.1-1.0之间的数字
            gpuMemoryUtil: {
                validate: (value) => {
                    if (!value) return { valid: true, message: '使用默认值0.9' };
                    const num = parseFloat(value);
                    if (isNaN(num)) return { valid: false, message: '必须是数字' };
                    if (num < 0.1 || num > 1.0) return { valid: false, message: '必须在0.1-1.0之间' };
                    return { valid: true, message: '有效值' };
                },
                trigger: 'input'
            },
            // CUDA设备：数字或用逗号分隔的数字列表
            cudaDevices: {
                validate: (value) => {
                    if (!value) return { valid: true, message: '使用默认设备0' };
                    if (!/^[0-9,]+$/.test(value)) return { valid: false, message: '必须是数字或逗号分隔的数字列表' };
                    return { valid: true, message: '有效设备列表' };
                },
                trigger: 'input'
            },
            // Conda环境名称：只允许字母、数字、下划线、点和连字符
            condaEnv: {
                validate: (value) => {
                    if (!value) return { valid: true, message: '使用默认环境vllm' };
                    if (!/^[a-zA-Z0-9_.-]+$/.test(value)) return { valid: false, message: '只能包含字母、数字、下划线、点和连字符' };
                    return { valid: true, message: '有效环境名称' };
                },
                trigger: 'input'
            },
            // 数字字段验证
            maxModelLen: {
                validate: (value) => {
                    if (!value) return { valid: true, message: '使用模型默认值' };
                    if (!/^\d+$/.test(value)) return { valid: false, message: '必须是数字' };
                    const num = parseInt(value);
                    if (num < 1) return { valid: false, message: '必须大于0' };
                    return { valid: true, message: '有效长度' };
                },
                trigger: 'input'
            },
            maxNumSeqs: {
                validate: (value) => {
                    if (!value) return { valid: true, message: '使用默认值256' };
                    if (!/^\d+$/.test(value)) return { valid: false, message: '必须是数字' };
                    const num = parseInt(value);
                    if (num < 1) return { valid: false, message: '必须大于0' };
                    return { valid: true, message: '有效值' };
                },
                trigger: 'input'
            },
            maxNumBatchedTokens: {
                validate: (value) => {
                    if (!value) return { valid: true, message: '使用默认值8192' };
                    if (!/^\d+$/.test(value)) return { valid: false, message: '必须是数字' };
                    const num = parseInt(value);
                    if (num < 1) return { valid: false, message: '必须大于0' };
                    return { valid: true, message: '有效值' };
                },
                trigger: 'input'
            }
        };

        // 为输入字段添加验证状态指示器
        const initValidationSystem = () => {
            // 为所有参数输入字段添加验证指示器
            document.querySelectorAll('.param-input').forEach(input => {
                const fieldId = input.id;
                if (!fieldId) return;
                
                // 创建验证状态指示器
                const statusIndicator = document.createElement('span');
                statusIndicator.className = 'validation-status';
                statusIndicator.id = `${fieldId}-validation`;
                statusIndicator.title = '验证状态';
                
                // 添加到input后面
                input.parentNode.appendChild(statusIndicator);
                
                // 添加验证事件监听器
                const rule = validationRules[fieldId];
                if (rule) {
                    const validateField = () => {
                        const value = input.value.trim();
                        const result = rule.validate(value);
                        
                        // 更新验证状态指示器
                        statusIndicator.className = 'validation-status';
                        if (result.valid) {
                            statusIndicator.classList.add('valid');
                            statusIndicator.innerHTML = '<i class="fas fa-check"></i>';
                            statusIndicator.title = result.message;
                        } else {
                            statusIndicator.classList.add('invalid');
                            statusIndicator.innerHTML = '<i class="fas fa-exclamation"></i>';
                            statusIndicator.title = result.message;
                        }
                    };
                    
                    // 根据规则设置事件触发器
                    if (rule.trigger === 'input') {
                        input.addEventListener('input', validateField);
                        input.addEventListener('blur', validateField);
                    } else if (rule.trigger === 'change') {
                        input.addEventListener('change', validateField);
                    }
                    
                    // 初始验证
                    validateField();
                }
            });
            
            // 为复选框添加简单验证（总是有效）
            document.querySelectorAll('.param-checkbox input').forEach(checkbox => {
                const fieldId = checkbox.id;
                if (!fieldId) return;
                
                const statusIndicator = document.createElement('span');
                statusIndicator.className = 'validation-status valid';
                statusIndicator.id = `${fieldId}-validation`;
                statusIndicator.innerHTML = '<i class="fas fa-check"></i>';
                statusIndicator.title = '复选框 - 有效';
                statusIndicator.style.top = '8px'; // 复选框位置调整
                
                checkbox.parentNode.appendChild(statusIndicator);
            });
        };

        // ==================== 输入验证系统结束 ====================

        document.addEventListener('DOMContentLoaded', () => {
            // Global error handler to suppress third-party errors (e.g., Firebase, browser extensions)
            window.onerror = function(msg, url, line, col, error) {
                // Suppress Firebase Remote Config errors
                if (msg && msg.includes && (
                    msg.includes('FirebaseError') ||
                    msg.includes('Remote Config') ||
                    msg.includes('fetch-timeout')
                )) {
                    return true; // Suppress error
                }
                return false; // Let other errors through
            };

            updateSchemeList();
            initSocket();
            // 启动nvitop监控
            setTimeout(() => startNvitopMonitoring(), 1000);
            initValidationSystem();
            
            // Auto-generate sh startup script in project folder
            setTimeout(async () => {
                const config = getConfig();
                if (config.modelPath) {
                    const scriptContent = generateShScript(config, '');
                    try {
                        const response = await fetch('/api/save-script', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                filename: `start_vllm.sh`,
                                content: scriptContent
                            })
                        });
                        const result = await response.json();
                        if (result.success) {
                            log(`启动脚本已生成: ${result.path}`, 'success');
                        }
                    } catch (e) {
                        // Silently fail, not critical
                    }
                }
            }, 1000);
            
            document.querySelectorAll('.panel-tab')[0].click();
            
            const inputs = document.querySelectorAll('.param-input, .param-checkbox input');
            inputs.forEach(input => {
                input.addEventListener('change', () => {
                    if (document.getElementById('commandPreview').textContent.includes('[vLLM 配置预览]')) {
                        generateCommand();
                    }
                });
            });
        });
    