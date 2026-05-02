import os
import json
import socket
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from database import get_db_connection, init_db

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'static/images'
CONFIG_FILE = 'config/config.json'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
init_db()

def get_local_ip():
    ips = ["localhost", "127.0.0.1"]
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        # doesn't even have to be reachable
        s.connect(('10.254.254.254', 1))
        ip = s.getsockname()[0]
        if ip not in ips:
            ips.append(ip)
        s.close()
    except Exception:
        pass
    return ips

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

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

@app.route('/api/mistakes/stats', methods=['GET'])
def get_mistakes_stats():
    conn = get_db_connection()
    row = conn.execute('SELECT COUNT(*) as count FROM mistakes WHERE ai_solution IS NULL').fetchone()
    conn.close()
    return jsonify({"unreviewed": row['count'] if row else 0})

def update_config_if_needed(subject, topic, difficulty):
    if not os.path.exists(CONFIG_FILE):
        return
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        
        updated = False
        if subject and subject not in config.get('subjects', []):
            config.setdefault('subjects', []).append(subject)
            updated = True
        
        if difficulty and difficulty not in config.get('difficulties', []):
            config.setdefault('difficulties', []).append(difficulty)
            updated = True
            
        if subject and topic:
            topics = config.setdefault('topics', {})
            if subject not in topics:
                topics[subject] = [topic]
                updated = True
            elif topic not in topics[subject]:
                topics[subject].append(topic)
                updated = True
                
        if updated:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f, indent=2)
    except Exception as e:
        print(f"Failed to update config: {e}")

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
    fix = request.form.get('actionable_fix')
    
    update_config_if_needed(subject, topic, difficulty)
    
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

    update_config_if_needed(subject, topic, difficulty)

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
        full_path = os.path.join('static', image_path)
        if os.path.exists(full_path):
            os.remove(full_path)
        
        conn.execute('DELETE FROM mistakes WHERE id = ?', (id,))
        conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/images/<path:filename>')
def custom_static(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    ips = get_local_ip()
    print("\n" + "╔" + "═"*58 + "╗")
    print("║" + " "*19 + "REVISION TRACKER PRO" + " "*19 + "║")
    print("╠" + "═"*58 + "╣")
    print(f"║ SERVER STARTED!                                          ║")
    print(f"║                                                          ║")
    print(f"║ On THIS computer, go to:                                 ║")
    print(f"║ http://localhost:5000                                    ║")
    print(f"║                                                          ║")
    print(f"║ On your iPhone/Tablet, try these addresses:              ║")
    for ip in ips:
        if ip != "localhost" and ip != "127.0.0.1":
            print(f"║ http://{ip:15}:5000                                 ║")
    print(f"║                                                          ║")
    print(f"║ NOTE: If it times out, ensure your Windows Firewall      ║")
    print(f"║ is allowing 'Python' through for Private networks!       ║")
    print("╚" + "═"*58 + "╝" + "\n")
    
    app.run(host='0.0.0.0', port=5000, debug=False)
