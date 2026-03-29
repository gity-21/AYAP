from flask import Flask, jsonify, request
import os
from map_processor import generate_lunar_map
from planner import plan_path
from vision import simulate_sensor_fusion

# URL yollarını düzelten static folder ayarı. Böylece 404 hatası gidecek.
app = Flask(__name__, static_folder='static', static_url_path='')

current_map = None

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/map', methods=['GET'])
def get_map():
    global current_map
    width = min(200, max(10, int(request.args.get('width', 50))))
    height = min(200, max(10, int(request.args.get('height', 50))))
    # 1. Aşama: Gerçekçi DEM haritası üretimi çağrısı
    current_map = generate_lunar_map(width, height)
    return jsonify(current_map)

@app.route('/api/plan', methods=['POST'])
def plan():
    global current_map
    if not current_map:
        return jsonify({"error": "Map not initialized"}), 400
        
    data = request.json or {}
    start = data.get('start')
    goal = data.get('goal')
    
    if not isinstance(start, list) or len(start) < 2:
        start = [0, 0]
    if not isinstance(goal, list) or len(goal) < 2:
        goal = [current_map['width'] - 1, current_map['height'] - 1]
    
    # 3. Aşama: Hybrid algoritmaları seçilebilir algoritmalar ile çalıştır.
    algo = data.get('algorithm', 'hybrid_astar') 
    
    result = plan_path(current_map, start, goal, algo)
    return jsonify(result)

@app.route('/api/vision', methods=['POST'])
def vision_update():
    global current_map
    if not current_map:
         return jsonify({"error": "Map not initialized"}), 400
    
    data = request.json
    rover_x = data.get('x', 0)
    rover_y = data.get('y', 0)
    
    # 2. Aşama: Sensor Fusion (Stereo Vision + 3D LiDAR + EKF)
    vision_result = simulate_sensor_fusion(current_map, rover_x, rover_y)
    return jsonify(vision_result)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
