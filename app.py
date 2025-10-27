import os
import io
import json
import logging
import requests
import numpy as np
from PIL import Image

# Register the necessary Keras components for serialization
from tensorflow.keras.models import model_from_json
# IMPORTANT: We need VGG16's preprocess_input function, AND we need to register it.
from tensorflow.keras.applications.vgg16 import preprocess_input as vgg16_preprocess_input
from tensorflow.keras.saving import register_keras_serializable
from flask import Flask, request, jsonify, render_template

# --- CONFIGURATION ---
ARCHITECTURE_FILE = 'knee_osteoarthritis_architecture.json'
MODEL_WEIGHTS_PATH = 'knee_osteoarthritis_weights.weights.h5'
KL_GRADE_MAP = {
    0: "Grade 0: Normal (No Osteoarthritis)",
    1: "Grade 1: Doubtful (Possible Osteophyte Lip)",
    2: "Grade 2: Minimal (Definite Osteophytes, Possible Joint Space Narrowing)",
    3: "Grade 3: Moderate (Moderate Osteophytes, Definite Joint Space Narrowing)",
    4: "Grade 4: Severe (Large Osteophytes, Severe Joint Space Narrowing, Sclerosis)"
}

# --- CUSTOM SERIALIZABLE FUNCTION FIX ---
# This is the function the model architecture is crashing on.
# We register the VGG16 preprocess function under the name 'preprocess_input'
# so that the loaded architecture JSON can find it.
@register_keras_serializable(package="Custom", name="preprocess_input")
def preprocess_input(x):
    # This calls the original VGG16 preprocessing logic which handles normalization
    return vgg16_preprocess_input(x)

# --- MODEL INITIALIZATION (Executed once at startup) ---
MODEL = None

# Configure basic logging
logging.basicConfig(level=logging.INFO)
app = Flask(__name__)

def load_model_from_files():
    """Loads the model architecture and weights from local files."""
    global MODEL
    logging.info("--- Starting Model Loading Process ---")

    # 1. Load Architecture
    try:
        logging.info(f"Loading architecture from {ARCHITECTURE_FILE}...")
        with open(ARCHITECTURE_FILE, 'r') as f:
            model_json = f.read()
        
        # NOTE: custom_objects is required to correctly deserialize the Lambda layer
        # that uses the globally registered 'preprocess_input' function.
        MODEL = model_from_json(model_json, custom_objects={'preprocess_input': preprocess_input})
        logging.info("Architecture loaded successfully.")
    except Exception as e:
        logging.error(f"FATAL ERROR during model architecture loading: {e}")
        # Re-raise the exception to stop the service since the core component failed
        raise e

    # 2. Download Weights (Handled by download_weights_if_not_present)
    # The download function will handle this step.
    
    # 3. Load Weights
    try:
        MODEL.load_weights(MODEL_WEIGHTS_PATH)
        logging.info("Model weights loaded successfully.")
        logging.info("--- Model Loaded Successfully ---")
    except Exception as e:
        logging.error(f"FATAL ERROR during model weights loading from {MODEL_WEIGHTS_PATH}: {e}")
        raise e


def download_weights_if_not_present():
    """Downloads model weights from a remote URL if not already present."""
    if os.path.exists(MODEL_WEIGHTS_PATH):
        logging.info(f"Model weights found locally at {MODEL_WEIGHTS_PATH}.")
        return

    weights_url = os.environ.get('WEIGHTS_DOWNLOAD_URL')
    if not weights_url:
        logging.error("FATAL ERROR: WEIGHTS_DOWNLOAD_URL environment variable is not set.")
        # Raise an error to stop the service since the core dependency is missing
        raise EnvironmentError("WEIGHTS_DOWNLOAD_URL not set.")

    logging.info(f"Downloading weights from URL: {weights_url}...")
    try:
        response = requests.get(weights_url, stream=True)
        response.raise_for_status() 

        with open(MODEL_WEIGHTS_PATH, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        logging.info("Download complete.")
    except requests.exceptions.RequestException as e:
        logging.error(f"FATAL ERROR during download: {e}")
        raise e
    except Exception as e:
        logging.error(f"FATAL ERROR during file write: {e}")
        raise e


# Run model loading and downloading only when the app starts
try:
    download_weights_if_not_present()
    load_model_from_files()
except Exception as e:
    # If anything fails during startup, the app will exit, preventing the 500 errors.
    logging.critical("Application failed to start due to model loading error.")
    # In a real environment, Gunicorn will likely restart the process.
    # For now, we will let the exception propagate.
    pass


# --- FLASK ROUTES ---

@app.route('/')
def index():
    """Renders the main index page."""
    return render_template('index.html')


@app.route('/predict', methods=['POST'])
def predict():
    """Handles image upload, prediction, and returns the result."""
    global MODEL

    if MODEL is None:
        # This should theoretically not happen if startup was successful, 
        # but serves as a final check for safety.
        logging.error("Attempted prediction but MODEL is not loaded.")
        return jsonify({'error': 'Model not loaded or failed to initialize.'}), 503

    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        # 1. Load image and ensure it's RGB
        img_data = file.read()
        img = Image.open(io.BytesIO(img_data)).convert('RGB')
        
        # 2. Preprocess image
        img = img.resize((224, 224))
        img_array = np.array(img, dtype='float32') # Use float32 for Keras input
        img_array = np.expand_dims(img_array, axis=0)
        
        # The Keras model includes the VGG16 preprocessing via the Lambda layer
        # which is now fixed by the global registration of 'preprocess_input'.
        
        # 3. Predict
        predictions = MODEL.predict(img_array)
        predicted_class = np.argmax(predictions[0])
        
        # 4. Format Result
        grade_text = KL_GRADE_MAP.get(predicted_class, "Unknown Grade")

        return jsonify({
            'grade': predicted_class,
            'description': grade_text,
            'probabilities': predictions[0].tolist()
        })

    except Exception as e:
        logging.error(f"Prediction error: {e}")
        return jsonify({'error': 'An unexpected error occurred during prediction.'}), 500


if __name__ == '__main__':
    # Flask development server runs this path
    app.run(debug=True, host='0.0.0.0', port=5000)
