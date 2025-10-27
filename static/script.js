const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const previewContainer = document.getElementById('preview-container');
const imagePreview = document.getElementById('image-preview');
const initialMessage = document.getElementById('initial-message');
const resultDisplay = document.getElementById('result-display');
const loadingSpinner = document.getElementById('loading-spinner');
const analyzeButton = document.getElementById('analyze-button');
const resetButton = document.getElementById('reset-button');
const gradeOutput = document.getElementById('grade-output');
const reportOutput = document.getElementById('report-output');

let uploadedFile = null;

// --- Helper Functions ---

function showMessage(type, message) {
    // Simple way to display user feedback (using the report output area)
    gradeOutput.textContent = '--';
    reportOutput.textContent = message;
    reportOutput.className = type === 'error' ? 'text-red-500 font-bold' : 'text-gray-400';
    resultDisplay.classList.remove('hidden');
    initialMessage.classList.add('hidden');
}

function resetUI() {
    uploadedFile = null;
    imagePreview.src = '';
    
    // Show initial upload area
    dropArea.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    
    // Reset buttons and messages
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = '<i data-lucide="zap"></i> Analyze Image';
    loadingSpinner.classList.add('hidden');
    resultDisplay.classList.add('hidden');
    initialMessage.classList.remove('hidden');
    gradeOutput.textContent = '--';
    reportOutput.textContent = 'The model is ready. A detailed medical summary will appear here after analysis.';
    lucide.createIcons(); // Re-initialize icons
}

function handleFile(file) {
    if (file && file.type.startsWith('image/')) {
        uploadedFile = file;
        const reader = new FileReader();
        
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            
            // Toggle visibility
            dropArea.classList.add('hidden');
            initialMessage.classList.add('hidden');
            previewContainer.classList.remove('hidden');
            resultDisplay.classList.add('hidden');
            
            // Enable analyze button
            analyzeButton.disabled = false;
        };
        reader.readAsDataURL(file);
    } else {
        showMessage('error', 'Please upload a valid image file (JPEG or PNG).');
    }
}

// --- API Communication ---

async function analyzeImage() {
    if (!uploadedFile) {
        showMessage('error', 'Please select an image before analyzing.');
        return;
    }

    // Set UI state to loading
    loadingSpinner.classList.remove('hidden');
    resultDisplay.classList.add('hidden');
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = '<div class="spinner-small"></div> Analyzing...';

    const formData = new FormData();
    formData.append('image', uploadedFile);

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (data.status === 'success') {
            gradeOutput.textContent = data.grade;
            reportOutput.textContent = data.report;
            reportOutput.className = 'report-content'; // Reset styling

            // Display results
            resultDisplay.classList.remove('hidden');
        } else {
            // Handle error from Flask backend
            showMessage('error', `Prediction Failed: ${data.error}`);
        }
    } catch (error) {
        // Handle network/fetch errors
        console.error("Fetch Error:", error);
        showMessage('error', 'Network error. Could not connect to the analysis server.');
    } finally {
        // Reset analysis button state
        loadingSpinner.classList.add('hidden');
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = '<i data-lucide="zap"></i> Analyze Image';
        lucide.createIcons();
    }
}

// --- Event Listeners ---

// Drag and Drop functionality
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.classList.add('drag-over');
});

dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('drag-over');
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    handleFile(file);
});

// Input click functionality
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    handleFile(file);
});

// Button actions
analyzeButton.addEventListener('click', analyzeImage);
resetButton.addEventListener('click', resetUI);

// Initial setup
resetUI(); // Ensures UI starts in a clean state
