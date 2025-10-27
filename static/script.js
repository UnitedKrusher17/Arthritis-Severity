// --- DOM Elements ---
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const imagePreview = document.getElementById('image-preview');
const previewContainer = document.getElementById('preview-container');
const analyzeButton = document.getElementById('analyze-button');
const resetButton = document.getElementById('reset-button');

const resultDisplay = document.getElementById('result-display');
const initialMessage = document.getElementById('initial-message');
const loadingSpinner = document.getElementById('loading-spinner');

const gradeOutput = document.getElementById('grade-output');
const reportOutput = document.getElementById('report-output');

let currentFile = null;

// --- UTILITY FUNCTIONS ---

function showMessage(type, message) {
    // Custom message box logic (replacing alert())
    // For simplicity here, we'll log to console and update the report area
    console.error(`[${type.toUpperCase()}] ${message}`);

    // Temporarily display the error in the report output
    gradeOutput.textContent = 'Error';
    gradeOutput.style.color = 'var(--color-error)';
    reportOutput.textContent = `An issue occurred: ${message}`;
    
    initialMessage.classList.add('hidden');
    loadingSpinner.classList.add('hidden');
    resultDisplay.classList.remove('hidden');
}


// --- FILE HANDLING LOGIC ---

function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        showMessage('warning', 'Please upload a valid image file.');
        return;
    }

    currentFile = file;

    // Read the file for local preview
    const reader = new FileReader();
    reader.onload = function(e) {
        imagePreview.src = e.target.result;
        
        // Show the preview area and hide the drop area
        dropArea.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        
        // Enable the analyze button
        analyzeButton.disabled = false;
    };
    reader.readAsDataURL(file);
    
    // Reset output display
    resultDisplay.classList.add('hidden');
    initialMessage.classList.remove('hidden');
    gradeOutput.textContent = '--';
    reportOutput.textContent = 'A detailed medical summary will appear here after analysis.';
    gradeOutput.style.color = 'var(--color-success)'; // Resetting color
}

function resetApp() {
    currentFile = null;
    fileInput.value = '';
    
    dropArea.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    analyzeButton.disabled = true;
    
    resultDisplay.classList.add('hidden');
    loadingSpinner.classList.add('hidden');
    initialMessage.classList.remove('hidden');

    gradeOutput.textContent = '--';
    reportOutput.textContent = 'A detailed medical summary will appear here after analysis.';
    gradeOutput.style.color = 'var(--color-success)';
}

// --- EVENT LISTENERS (File Input) ---

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Drop area events
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.classList.add('active');
});

dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('active');
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('active');
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

// Reset button
resetButton.addEventListener('click', resetApp);


// --- API CALL LOGIC ---

analyzeButton.addEventListener('click', async () => {
    if (!currentFile || analyzeButton.disabled) return;

    // Show loading state
    initialMessage.classList.add('hidden');
    resultDisplay.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = '<div class="spinner-small"></div> Analyzing...';

    // Prepare form data
    const formData = new FormData();
    formData.append('image', currentFile);

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        // Check for server-side errors
        if (response.ok && data.status === "success") {
            // Success State
            gradeOutput.textContent = data.grade;
            reportOutput.textContent = data.report;
            gradeOutput.style.color = 'var(--color-success)'; // Green for success
        } else {
            // Server returned an error object
            showMessage('error', data.error || 'An unknown error occurred during prediction.');
        }

    } catch (error) {
        // Network or fetch error
        console.error('Fetch error:', error);
        showMessage('network-error', 'Could not connect to the analysis server. Please check deployment status.');
    } finally {
        // Reset button state
        loadingSpinner.classList.add('hidden');
        resultDisplay.classList.remove('hidden');
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = '<i data-lucide="zap"></i> Analyze Image';
        // Re-initialize Lucide icons to display the zap icon again
        lucide.createIcons(); 
    }
});
