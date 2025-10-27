document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('uploadForm');
    const fileInput = document.getElementById('fileInput');
    const imagePreview = document.getElementById('imagePreview');
    // Using IDs from the HTML Canvas
    const loading = document.getElementById('loading');
    const resultOutput = document.getElementById('resultOutput');
    const submitBtn = document.getElementById('submitBtn');

    // --- Utility Functions ---

    // Function to show/hide loading spinner and manage button state
    const setLoading = (isLoading) => {
        loading.classList.toggle('hidden', !isLoading);
        resultOutput.classList.add('hidden');
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? 'Analyzing...' : 'Analyze Image';
        
        if (!isLoading) {
             // Clear the result area unless we are actively displaying a new result
             resultOutput.innerHTML = '';
        }
    };

    // Function to display the result (including probability bars)
    const displayResult = (data) => {
        resultOutput.classList.remove('hidden');
        
        // Ensure probabilities array is available and length is 5 (for KL Grades 0-4)
        const probabilities = Array.isArray(data.probabilities) && data.probabilities.length === 5 ? data.probabilities : [0, 0, 0, 0, 0];

        // Map the result data to the HTML structure (using classes defined in style.css)
        resultOutput.innerHTML = `
            <div class="result-box">
                <p class="grade-label">Predicted Kellgren-Lawrence Grade</p>
                <div class="grade-output">Grade ${data.grade}</div>
            </div>

            <div class="report-section">
                <h3>Prediction Summary</h3>
                <p class="report-content">${data.description}</p>
            </div>
            
            <div class="report-section">
                <h3>Confidence Breakdown</h3>
                <div class="probability-chart mt-4">
                    ${probabilities.map((prob, index) => {
                        const percent = Math.round(prob * 100);
                        // Using a simple CSS structure for bars
                        return `
                            <div class="bar-container" style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px;">
                                <span class="label" style="width: 70px; font-weight: 600;">Grade ${index}</span>
                                <div class="bar-visual" style="flex-grow: 1; height: 18px; background-color: var(--color-text-muted); border-radius: 4px; overflow: hidden;">
                                    <div style="width: ${percent}%; height: 100%; background-color: var(--color-primary); transition: width 0.5s;"></div>
                                </div>
                                <span style="font-weight: 700; width: 40px; text-align: right;">${percent}%</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    };

    // --- Event Listeners ---

    // 1. Image Preview Handler (Shows the selected image)
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Ensure the preview content uses a standard img tag
                imagePreview.innerHTML = `<img src="${e.target.result}" alt="X-Ray Preview" style="max-width: 100%; max-height: 250px; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);
        } else {
            // Clear preview if file selection is cancelled
            imagePreview.innerHTML = '<span>Image Preview</span>';
        }
    });

    // 2. Form Submission Handler (Sends the data to the server)
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        // REFINED CRITICAL CHECK: Check the files directly on the input element
        const file = fileInput.files[0];
        if (!file) {
            // NOTE: Changing alert() to a simple console log and return for safety, 
            // relying on the 'required' attribute on the file input to enforce selection.
            console.error('Submission blocked: No file selected.');
            return;
        }
        
        // 1. Create a FormData object for file upload
        const formData = new FormData(form); // Pass the form directly to capture ALL form data
        // 2. We don't need to manually append if the input has name="file", 
        // but we'll ensure it is present by setting it explicitly just in case.
        // It's already named 'file' in the HTML, so this is technically redundant but harmless.
        
        // This is the CRITICAL line. We check the 'file' input specifically.
        if (!formData.has('file') || !formData.get('file').size) {
            // This extra check catches cases where the file input is present but empty or invalid
            console.error('FormData is missing the file part.');
            resultOutput.innerHTML = `<p class="error" style="color: var(--color-error); padding: 15px; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">Analysis Failed: Please select a valid image file.</p>`;
            resultOutput.classList.remove('hidden');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                // DO NOT set 'Content-Type': 'multipart/form-data'. 
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                // The server returned the 400 or 500 error message
                resultOutput.innerHTML = `<p class="error" style="color: var(--color-error); padding: 15px; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">Analysis Failed: ${data.error || 'Unknown server error.'}</p>`;
                resultOutput.classList.remove('hidden');
                console.error("Server Error:", data.error);
            } else {
                displayResult(data);
            }

        } catch (error) {
            console.error('Fetch error:', error);
            resultOutput.innerHTML = `<p class="error" style="color: var(--color-error); padding: 15px; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">Network Error: Could not reach the server. Check console for details.</p>`;
            resultOutput.classList.remove('hidden');
        } finally {
            setLoading(false);
        }
    });
});
