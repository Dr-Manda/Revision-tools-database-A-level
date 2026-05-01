import os
import json
import socket
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from database import get_db_connection, init_db

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'images'
CONFIG_FILE = 'config.json'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
init_db()

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

@app.route('/api/config')
def get_config():
    if not os.path.exists(CONFIG_FILE):
        return jsonify({"error": "Config file not found"}), 404
    with open(CONFIG_FILE, 'r') as f:
        return jsonify(json.load(f))

@app.route('/api/mistakes', methods=['GET'])
def get_mistakes():
    subject = request.args.get('subject')
    conn = get_db_connection()
    if subject:
        mistakes = conn.execute('SELECT * FROM mistakes WHERE subject = ? ORDER BY timestamp DESC', (subject,)).fetchall()
    else:
        mistakes = conn.execute('SELECT * FROM mistakes ORDER BY timestamp DESC').fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in mistakes])

@app.route('/api/mistakes', methods=['POST'])
def add_mistake():
    if 'image' not in request.files:
        return jsonify({"error": "No image part"}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    subject = request.form.get('subject')
    topic = request.form.get('topic')
    difficulty = request.form.get('difficulty')
    mistake = request.form.get('mistake')
    fix = request.form.get('fix')
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}{file_ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    
    file.save(filepath)
    image_path = f"images/{filename}"

    conn = get_db_connection()
    conn.execute('''
        INSERT INTO mistakes (subject, topic, difficulty, mistake, actionable_fix, image_path, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (subject, topic, difficulty, mistake, fix, image_path, timestamp))
    conn.commit()
    conn.close()
    
    return jsonify({"status": "success", "image_path": image_path}), 201

@app.route('/api/mistakes/<int:id>', methods=['PUT'])
def update_mistake(id):
    data = request.json
    subject = data.get('subject')
    topic = data.get('topic')
    difficulty = data.get('difficulty')
    mistake = data.get('mistake')
    fix = data.get('actionable_fix')

    conn = get_db_connection()
    conn.execute('''
        UPDATE mistakes 
        SET subject = ?, topic = ?, difficulty = ?, mistake = ?, actionable_fix = ?
        WHERE id = ?
    ''', (subject, topic, difficulty, mistake, fix, id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/mistakes/<int:id>', methods=['DELETE'])
def delete_mistake(id):
    conn = get_db_connection()
    mistake = conn.execute('SELECT image_path FROM mistakes WHERE id = ?', (id,)).fetchone()
    if mistake:
        # Delete image file if it exists
        image_path = mistake['image_path']
        if os.path.exists(image_path):
            os.remove(image_path)
        
        conn.execute('DELETE FROM mistakes WHERE id = ?', (id,))
        conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/images/<path:filename>')
def custom_static(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    ip = get_local_ip()
    print("\n" + "="*50)
    print(f"SERVER STARTED!")
    print(f"On your iPhone, type this address into Safari:")
    print(f"http://{ip}:5000")
    print("="*50 + "\n")
    app.run(host='0.0.0.0', port=5000)
