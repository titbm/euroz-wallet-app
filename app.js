// Contract addresses
const EUROZ_ADDRESS = '0xED1B7De57918f6B7c8a7a7767557f09A80eC2a35';
const CEUROZ_ADDRESS = '0xCD25e0e4972e075C371948c7137Bcd498C1F4e89';

// ABIs
const EUROZ_ABI = [
    'function mint(address to) public',
    'function balanceOf(address account) view returns (uint256)',
    'function approve(address spender, uint256 amount) public returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

const CEUROZ_ABI = [
    'function wrap(address to, uint256 amount) public',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

let provider;
let signer;
let userAddress;
let eurozContract;
let ceurozContract;
let wallet = null; // For private key mode
let isPrivateKeyMode = false;
let automationInterval = null;
let isAutomationRunning = false;
let countdownInterval = null;
let nextCycleTime = null;

// Clear everything on page unload
window.addEventListener('beforeunload', () => {
    if (automationInterval) {
        clearInterval(automationInterval);
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    wallet = null;
    isPrivateKeyMode = false;
});

// Show private key input
document.getElementById('showPrivateKeyBtn').addEventListener('click', () => {
    document.getElementById('privateKeySection').style.display = 'block';
    document.querySelector('.connection-options').style.display = 'none';
});

// Clear clipboard after paste
document.getElementById('privateKeyInput').addEventListener('paste', async (e) => {
    setTimeout(async () => {
        try {
            await navigator.clipboard.writeText('');
            console.log('Clipboard cleared');
        } catch (err) {
            console.log('Could not clear clipboard:', err);
        }
    }, 100);
});

// Connect with private key
document.getElementById('connectPrivateKeyBtn').addEventListener('click', async () => {
    try {
        let privateKey = document.getElementById('privateKeyInput').value.trim();
        
        if (!privateKey) {
            showStatus('mintStatus', 'error', 'Please enter a private key');
            return;
        }

        // Add 0x prefix if not present
        if (!privateKey.startsWith('0x')) {
            privateKey = '0x' + privateKey;
        }

        // Validate length (should be 66 characters with 0x)
        if (privateKey.length !== 66) {
            showStatus('mintStatus', 'error', 'Invalid private key length (should be 64 hex characters)');
            return;
        }

        // Setup provider
        provider = new ethers.providers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');

        // Create wallet from private key
        wallet = new ethers.Wallet(privateKey, provider);
        userAddress = wallet.address;
        isPrivateKeyMode = true;

        // Clear input immediately
        document.getElementById('privateKeyInput').value = '';

        // Initialize contracts with wallet as signer
        eurozContract = new ethers.Contract(EUROZ_ADDRESS, EUROZ_ABI, wallet);
        ceurozContract = new ethers.Contract(CEUROZ_ADDRESS, CEUROZ_ABI, wallet);

        // Update UI
        document.getElementById('privateKeySection').style.display = 'none';
        document.getElementById('walletInfo').style.display = 'block';
        document.getElementById('walletAddress').textContent = `Connected: ${userAddress}`;
        
        document.getElementById('mintSection').style.display = 'block';
        document.getElementById('wrapSection').style.display = 'block';
        document.getElementById('automationSection').style.display = 'block';

        // Load balances
        await updateBalances();

        showStatus('mintStatus', 'success', '✅ Connected with private key (stored in memory only)');

    } catch (error) {
        console.error('Connection error:', error);
        showStatus('mintStatus', 'error', `Connection failed: ${error.message}`);
        // Clear on error
        document.getElementById('privateKeyInput').value = '';
        wallet = null;
    }
});

// Disconnect
document.getElementById('disconnectBtn').addEventListener('click', () => {
    if (automationInterval) {
        clearInterval(automationInterval);
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    wallet = null;
    isPrivateKeyMode = false;
    location.reload();
});

// Connect with MetaMask
document.getElementById('connectMetamaskBtn').addEventListener('click', async () => {
    try {
        if (typeof window.ethereum === 'undefined') {
            showStatus('mintStatus', 'error', 'Please install MetaMask!');
            return;
        }

        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0];

        // Setup provider and signer
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();

        // Check network
        const network = await provider.getNetwork();
        if (network.chainId !== 11155111) {
            showStatus('mintStatus', 'error', 'Please switch to Sepolia network!');
            return;
        }

        // Initialize contracts
        eurozContract = new ethers.Contract(EUROZ_ADDRESS, EUROZ_ABI, signer);
        ceurozContract = new ethers.Contract(CEUROZ_ADDRESS, CEUROZ_ABI, signer);

        // Update UI
        document.querySelector('.connection-options').style.display = 'none';
        document.getElementById('walletInfo').style.display = 'block';
        document.getElementById('walletAddress').textContent = `Connected: ${userAddress}`;
        
        document.getElementById('mintSection').style.display = 'block';
        document.getElementById('wrapSection').style.display = 'block';
        document.getElementById('automationSection').style.display = 'block';

        // Load balances
        await updateBalances();

        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                location.reload();
            } else {
                userAddress = accounts[0];
                location.reload();
            }
        });

    } catch (error) {
        console.error('Connection error:', error);
        showStatus('mintStatus', 'error', `Connection failed: ${error.message}`);
    }
});

// Update balances
async function updateBalances() {
    try {
        // Use appropriate contract instance based on connection mode
        const eurozContractRead = isPrivateKeyMode 
            ? eurozContract 
            : new ethers.Contract(EUROZ_ADDRESS, EUROZ_ABI, provider);
        const ceurozContractRead = isPrivateKeyMode 
            ? ceurozContract 
            : new ethers.Contract(CEUROZ_ADDRESS, CEUROZ_ABI, provider);

        const eurozBalance = await eurozContractRead.balanceOf(userAddress);
        
        // cEUROZ might return encrypted balance, try to get it differently
        let ceurozFormatted = '0.0';
        try {
            const ceurozBalance = await ceurozContractRead.balanceOf(userAddress);
            // Check if it's a BigNumber
            if (ceurozBalance._isBigNumber || typeof ceurozBalance === 'object') {
                ceurozFormatted = ethers.utils.formatUnits(ceurozBalance, 6);
            } else {
                ceurozFormatted = '0.0';
            }
        } catch (err) {
            console.log('cEUROZ balance error:', err);
            ceurozFormatted = 'N/A (encrypted)';
        }
        
        const eurozFormatted = ethers.utils.formatUnits(eurozBalance, 6);

        document.getElementById('balanceInfo').innerHTML = `
            <strong>EUROZ:</strong> ${eurozFormatted}<br>
            <strong>cEUROZ:</strong> ${ceurozFormatted}
        `;
    } catch (error) {
        console.error('Balance error:', error);
    }
}

// Mint EUROZ
document.getElementById('mintBtn').addEventListener('click', async () => {
    const btn = document.getElementById('mintBtn');
    const statusDiv = document.getElementById('mintStatus');
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span>Minting...';
        showStatus('mintStatus', 'info', 'Waiting for transaction confirmation...');

        const tx = await eurozContract.mint(userAddress);
        showStatus('mintStatus', 'info', `Transaction sent! Waiting for confirmation... <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="tx-link">View on Etherscan</a>`);

        await tx.wait();
        
        showStatus('mintStatus', 'success', `✅ Successfully minted 10 EUROZ! <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="tx-link">View on Etherscan</a>`);
        
        await updateBalances();

    } catch (error) {
        console.error('Mint error:', error);
        let errorMsg = 'Mint failed';
        if (error.message.includes('user rejected')) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('EnforcedPause')) {
            errorMsg = 'Contract is paused';
        } else if (error.message) {
            errorMsg = error.message;
        }
        showStatus('mintStatus', 'error', `❌ ${errorMsg}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Mint 10 EUROZ';
    }
});

// Approve EUROZ for wrapping
document.getElementById('approveBtn').addEventListener('click', async () => {
    const btn = document.getElementById('approveBtn');
    const statusDiv = document.getElementById('wrapStatus');
    const amountInput = document.getElementById('wrapAmount');
    
    try {
        const amount = amountInput.value;
        if (!amount || parseFloat(amount) <= 0) {
            showStatus('wrapStatus', 'error', 'Please enter a valid amount');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span>Approving...';
        showStatus('wrapStatus', 'info', 'Waiting for approval transaction...');

        const amountWei = ethers.utils.parseUnits(amount, 6);
        const tx = await eurozContract.approve(CEUROZ_ADDRESS, amountWei);
        
        showStatus('wrapStatus', 'info', `Approval sent! Waiting for confirmation... <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="tx-link">View on Etherscan</a>`);

        await tx.wait();
        
        showStatus('wrapStatus', 'success', `✅ Approved! Now click "Step 2: Wrap" <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="tx-link">View on Etherscan</a>`);
        
        document.getElementById('wrapBtn').disabled = false;

    } catch (error) {
        console.error('Approve error:', error);
        let errorMsg = 'Approval failed';
        if (error.message.includes('user rejected')) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message) {
            errorMsg = error.message;
        }
        showStatus('wrapStatus', 'error', `❌ ${errorMsg}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Step 1: Approve';
    }
});

// Wrap EUROZ to cEUROZ
document.getElementById('wrapBtn').addEventListener('click', async () => {
    const btn = document.getElementById('wrapBtn');
    const statusDiv = document.getElementById('wrapStatus');
    const amountInput = document.getElementById('wrapAmount');
    
    try {
        const amount = amountInput.value;
        if (!amount || parseFloat(amount) <= 0) {
            showStatus('wrapStatus', 'error', 'Please enter a valid amount');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span>Wrapping...';
        showStatus('wrapStatus', 'info', 'Waiting for wrap transaction...');

        const amountWei = ethers.utils.parseUnits(amount, 6);
        const tx = await ceurozContract.wrap(userAddress, amountWei);
        
        showStatus('wrapStatus', 'info', `Wrap sent! Waiting for confirmation... <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="tx-link">View on Etherscan</a>`);

        await tx.wait();
        
        showStatus('wrapStatus', 'success', `✅ Successfully wrapped ${amount} EUROZ to cEUROZ! <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="tx-link">View on Etherscan</a>`);
        
        await updateBalances();
        amountInput.value = '';
        btn.disabled = true;

    } catch (error) {
        console.error('Wrap error:', error);
        let errorMsg = 'Wrap failed';
        if (error.message.includes('user rejected')) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('Paused')) {
            errorMsg = 'Contract is paused';
        } else if (error.message.includes('insufficient allowance')) {
            errorMsg = 'Insufficient allowance - please approve first';
        } else if (error.message) {
            errorMsg = error.message;
        }
        showStatus('wrapStatus', 'error', `❌ ${errorMsg}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Step 2: Wrap';
    }
});

// Helper function to show status messages
function showStatus(elementId, type, message) {
    const statusDiv = document.getElementById(elementId);
    statusDiv.className = `status ${type}`;
    statusDiv.innerHTML = message;
    statusDiv.style.display = 'block';
}


// Automation functions
function logAutomation(message) {
    const logDiv = document.getElementById('automationLog');
    logDiv.style.display = 'block';
    const timestamp = new Date().toLocaleTimeString();
    logDiv.innerHTML += `[${timestamp}] ${message}<br>`;
    logDiv.scrollTop = logDiv.scrollHeight;
}

function getRandomAmount(min, max, maxDecimals) {
    const amount = Math.random() * (max - min) + min;
    const decimals = Math.floor(Math.random() * (maxDecimals + 1));
    const result = parseFloat(amount.toFixed(decimals));
    // Ensure result is at least min value
    return result < min ? min : result;
}

function getRandomDelay() {
    // 5-6 minutes in milliseconds
    return (5 + Math.random()) * 60 * 1000;
}

function getRandomPause() {
    // Random pause between transactions: 2-40 seconds
    return (2 + Math.random() * 38) * 1000;
}

function startCountdown(milliseconds) {
    const timerDiv = document.getElementById('countdownTimer');
    timerDiv.style.display = 'block';
    nextCycleTime = Date.now() + milliseconds;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    countdownInterval = setInterval(() => {
        const remaining = nextCycleTime - Date.now();
        
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            timerDiv.textContent = 'Starting next cycle...';
            return;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        timerDiv.textContent = `⏱️ Next cycle in: ${minutes}m ${seconds}s`;
    }, 1000);
}

async function checkAndMint() {
    try {
        const balance = await eurozContract.balanceOf(userAddress);
        const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, 6));
        
        logAutomation(`Current EUROZ balance: ${balanceFormatted}`);
        
        if (balanceFormatted < 3) {
            logAutomation('Balance < 3, minting...');
            const tx = await eurozContract.mint(userAddress);
            logAutomation(`Mint tx sent: ${tx.hash}`);
            await tx.wait();
            logAutomation('✅ Mint confirmed');
            await updateBalances();
            return true;
        }
        return false;
    } catch (error) {
        logAutomation(`❌ Mint error: ${error.message}`);
        return false;
    }
}

async function checkAllowanceAndApprove() {
    try {
        // Check current allowance
        const allowance = await eurozContract.allowance(userAddress, CEUROZ_ADDRESS);
        const allowanceFormatted = parseFloat(ethers.utils.formatUnits(allowance, 6));
        
        logAutomation(`Current allowance: ${allowanceFormatted} EUROZ`);
        
        // If allowance is less than 10, approve more
        if (allowanceFormatted < 10) {
            const randomAmount = Math.floor(Math.random() * 9000) + 1000; // 1000-10000
            logAutomation(`Allowance low, approving ${randomAmount} EUROZ...`);
            
            const amountWei = ethers.utils.parseUnits(randomAmount.toString(), 6);
            const tx = await eurozContract.approve(CEUROZ_ADDRESS, amountWei);
            logAutomation(`Approve tx sent: ${tx.hash}`);
            await tx.wait();
            logAutomation(`✅ Approved ${randomAmount} EUROZ`);
            return true;
        } else {
            logAutomation('Allowance sufficient, skipping approve');
            return false;
        }
    } catch (error) {
        logAutomation(`❌ Approve error: ${error.message}`);
        return false;
    }
}

async function sendRandomWrap() {
    try {
        // Check balance before wrapping
        const balance = await eurozContract.balanceOf(userAddress);
        const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, 6));
        
        if (balanceFormatted < 0.1) {
            logAutomation(`❌ Insufficient balance (${balanceFormatted} EUROZ), skipping wrap`);
            return false;
        }
        
        // Generate random amount, but not more than available balance
        let amount = getRandomAmount(0.1, 3, 4);
        if (amount > balanceFormatted) {
            amount = parseFloat(balanceFormatted.toFixed(4));
            logAutomation(`Adjusting amount to available balance: ${amount} EUROZ`);
        }
        
        logAutomation(`Wrapping ${amount} EUROZ (balance: ${balanceFormatted})...`);
        
        const amountWei = ethers.utils.parseUnits(amount.toString(), 6);
        const tx = await ceurozContract.wrap(userAddress, amountWei);
        logAutomation(`Wrap tx sent: ${tx.hash}`);
        await tx.wait();
        logAutomation(`✅ Wrapped ${amount} EUROZ`);
        await updateBalances();
        return true;
    } catch (error) {
        logAutomation(`❌ Wrap error: ${error.message}`);
        return false;
    }
}

async function runAutomationCycle() {
    if (!isAutomationRunning) return;
    
    logAutomation('--- Starting automation cycle ---');
    
    // Check balance and mint if needed
    const didMint = await checkAndMint();
    
    if (didMint) {
        const pause = getRandomPause();
        logAutomation(`Waiting ${(pause/1000).toFixed(1)}s...`);
        await new Promise(resolve => setTimeout(resolve, pause));
    }
    
    // Check allowance and approve only if needed
    const didApprove = await checkAllowanceAndApprove();
    
    if (didApprove) {
        const pause = getRandomPause();
        logAutomation(`Waiting ${(pause/1000).toFixed(1)}s...`);
        await new Promise(resolve => setTimeout(resolve, pause));
    }
    
    // Start countdown from first wrap transaction
    const nextDelay = getRandomDelay();
    const nextMinutes = Math.floor(nextDelay / 60000);
    logAutomation(`Timer started: next cycle in ~${nextMinutes} minutes from first wrap`);
    startCountdown(nextDelay);
    
    // Send 3 random wrap transactions
    for (let i = 1; i <= 3; i++) {
        if (!isAutomationRunning) break;
        
        logAutomation(`Sending wrap ${i}/3...`);
        await sendRandomWrap();
        
        // Random pause between wraps
        if (i < 3) {
            const pause = getRandomPause();
            logAutomation(`Waiting ${(pause/1000).toFixed(1)}s before next wrap...`);
            await new Promise(resolve => setTimeout(resolve, pause));
        }
    }
    
    logAutomation('--- Cycle complete ---');
}

// Start automation
document.getElementById('startAutomationBtn').addEventListener('click', async () => {
    if (!isPrivateKeyMode) {
        showStatus('automationStatus', 'error', 'Automation only works with private key mode');
        return;
    }
    
    isAutomationRunning = true;
    document.getElementById('startAutomationBtn').style.display = 'none';
    document.getElementById('stopAutomationBtn').style.display = 'block';
    document.getElementById('automationLog').innerHTML = '';
    
    showStatus('automationStatus', 'success', '🤖 Automation started');
    logAutomation('🤖 Automation started');
    
    // Main automation loop
    async function runLoop() {
        if (!isAutomationRunning) return;
        
        // Run cycle
        await runAutomationCycle();
        
        // Wait for the delay that was set during the cycle
        // The countdown is already running, just wait for it
        if (isAutomationRunning && nextCycleTime) {
            const waitTime = nextCycleTime - Date.now();
            if (waitTime > 0) {
                automationInterval = setTimeout(runLoop, waitTime);
            } else {
                // If time already passed, run immediately
                runLoop();
            }
        }
    }
    
    // Start the loop
    runLoop();
});

// Stop automation
document.getElementById('stopAutomationBtn').addEventListener('click', () => {
    isAutomationRunning = false;
    if (automationInterval) {
        clearTimeout(automationInterval);
        automationInterval = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    document.getElementById('startAutomationBtn').style.display = 'block';
    document.getElementById('stopAutomationBtn').style.display = 'none';
    document.getElementById('countdownTimer').style.display = 'none';
    
    showStatus('automationStatus', 'info', '⏸️ Automation stopped');
    logAutomation('⏸️ Automation stopped by user');
});
