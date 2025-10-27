import os
import io
import requests
import numpy as np
from PIL import Image

from flask import Flask, render_template, request, jsonify
from tensorflow.keras.models import model_from_json
# Note: Using tensorflow.keras.utils for image processing is often safer 
# than the older tensorflow.keras.preprocessing.image import
from tensorflow.keras.utils import load_img, img_to_array

# --- CONFIGURATION & CONSTANTS ---
ARCHITECTURE_PATH = 'knee_osteoarthritis_architecture.json'
WEIGHTS_FILENAME = 'knee_osteoarthritis_weights.weights.h5' 
IMAGE_SIZE = (224, 224) # Ensure this matches your model's input size
KL_GRADES = {
    0: "Kellgren-Lawrence Grade 0 (Normal)",
    1: "Kellgren-Lawrence Grade 1 (Doubtful)",
    2: "Kellgren-Lawrence Grade 2 (Minimal)",
    3: "Kellgren-Lawrence Grade 3 (Moderate)",
    4: "Kellgren-Lawrence Grade 4 (Severe)"
}

# Get secrets securely from environment variables (set on Render)
WEIGHTS_URL = os.environ.get('WEIGHTS_DOWNLOAD_URL')

# Initialize global model placeholder
MODEL = None

app = Flask(__name__)

# --- CORE BACKEND FUNCTION (Model Loading) ---

def load_model_from_files():
    """
    Loads the model architecture from JSON and downloads the large weights file 
    from Hugging Face (if missing) before loading the weights.
    This runs once when the Flask server starts.
    """
    global MODEL
    if MODEL is not None:
        return MODEL # Model is already loaded

    print("--- Starting Model Loading Process ---")
    
    # We only need the WEIGHTS_URL environment variable for model loading
    if not WEIGHTS_URL:
        print("ERROR: WEIGHTS_DOWNLOAD_URL environment variable is not set. Deployment will fail.")
        return None

    try:
        # 1. Load the small architecture file from GitHub (local)
        print(f"Loading architecture from {ARCHITECTURE_PATH}...")
        with open(ARCHITECTURE_PATH, 'r') as f:
            json_config = f.read()
        model = model_from_json(json_config)
        
        # 2. Download the large weights file from Hugging Face if it's missing
        if not os.path.exists(WEIGHTS_FILENAME):
            print(f"Downloading weights from URL: {WEIGHTS_URL}...")
            r = requests.get(WEIGHTS_URL, stream=True)
            r.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            
            # Save the file to the local directory on the server
            with open(WEIGHTS_FILENAME, 'wb') as f:
                # Iterate over content in chunks for large files
                for chunk in r.iter_content(chunk_size=8192): 
                    f.write(chunk)
            print("Download complete.")

        # 3. Load the weights into the model architecture
        print(f"Loading weights into model...")
        model.load_weights(WEIGHTS_FILENAME)
        MODEL = model
        print("--- Model Loaded Successfully ---")
        return MODEL

    except Exception as e:
        print(f"FATAL ERROR during model loading: {e}")
        return None

# Run model loading at server startup
with app.app_context():
    load_model_from_files()


# --- FLASK ROUTES (Serving the Front End and Handling Prediction) ---

@app.route('/')
def index():
    """Serves the main HTML page (templates/index.html)."""
    return render_template('index.html')


@app.route('/predict', methods=['POST'])
def predict():
    """Handles image upload and prediction."""
    
    if MODEL is None:
        return jsonify({"status": "error", "error": "Model failed to load on server startup. Check server logs."}), 500

    # 1. Check for image file
    if 'image' not in request.files:
        return jsonify({"status": "error", "error": "No image file provided in the request."}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"status": "error", "error": "No selected file."}), 400
    
    if not file.content_type.startswith('image'):
         return jsonify({"status": "error", "error": "Invalid file type. Please upload an image."}), 400

    try:
        # 2. Preprocess the image for the Keras Model
        # Read image data into a PIL Image object
        img = Image.open(io.BytesIO(file.read())).convert('RGB')
        
        # Resize to the required model input size (224x224)
        img = img.resize(IMAGE_SIZE)
        
        # Convert to numpy array and normalize
        img_array = img_to_array(img)
        img_array = np.expand_dims(img_array, axis=0) # Add batch dimension
        img_array /= 255.0 # Normalize pixel values to 0-1 range
        
        # 3. Keras Model Prediction
        predictions = MODEL.predict(img_array)
        
        # The model output is a probability vector. Get the index of the highest probability.
        predicted_class_index = np.argmax(predictions[0])
        
        # Map the index (0-4) to the descriptive KL grade text
        grade_text = KL_GRADES.get(predicted_class_index, "Unknown Grade")
        
        # 4. Return JSON Response to the Front End
        # The front end expects a report field, so we add a simple placeholder.
        return jsonify({
            "status": "success",
            "grade": grade_text,
            "report": "Analysis complete! This is the core prediction. A detailed report feature can be added here later."
        })

    except Exception as e:
        print(f"Prediction or Processing Error: {e}")
        # Return a clean error message to the front end
        return jsonify({
            "status": "error", 
            "error": f"An error occurred during image processing: {str(e)}"
        }), 500

# This is required for Render deployment to correctly start Gunicorn
if __name__ == '__main__':
    # In a real deployed environment, debug should be False
    app.run(debug=True)
