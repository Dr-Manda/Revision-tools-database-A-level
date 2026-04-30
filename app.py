import os
import csv
import json
import socket
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'images'
CSV_FILE = 'error_ledger.csv'
CONFIG_FILE = 'config.json'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/config')
def get_config():
    with open(CONFIG_FILE, 'r') as f:
        return jsonify(json.load(f))

@app.route('/upload', methods=['POST'])
def upload():
    if 'image' not in request.files:
        return "No image part", 400
    
    file = request.files['image']
    if file.filename == '':
        return "No selected file", 400

    # Get metadata
    subject = request.form.get('subject')
    topic = request.form.get('topic')
    difficulty = request.form.get('difficulty')
    mistake = request.form.get('mistake', '').replace(',', ';') # Simple CSV escape
    fix = request.form.get('fix', '').replace(',', ';')
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}{file_ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    
    # Save file
    file.save(filepath)
    
    # Save to CSV
    # Headers: Subject,Topic,Difficulty,Mistake,Actionable_Fix,Image_Path,Timestamp
    with open(CSV_FILE, 'a', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([subject, topic, difficulty, mistake, fix, f"images/{filename}", timestamp])
    
    return "Success", 200

if __name__ == '__main__':
    ip = get_local_ip()
    print("\n" + "="*50)
    print(f"SERVER STARTED!")
    print(f"On your iPhone, type this address into Safari:")
    print(f"http://{ip}:5000")
    print("="*50 + "\n")
    app.run(host='0.0.0.0', port=5000)
