import random

def simulate_sensor_fusion(map_data, rover_x, rover_y):
    width = map_data['width']
    height = map_data['height']
    grid = map_data['grid']
    
    detected_objects = []
    
    # Simulate dust adhesion and Image Quality Index (IQI)
    iqi = round(random.uniform(0.3, 1.0), 2)
    primary_sensor = "STEREO_VISION"
    
    # If IQI drops below 0.6 due to electrostatic lunar dust, switch to LiDAR
    if iqi < 0.6:
        primary_sensor = "3D_LIDAR_SLAM"
        
    # EKF Stability check (Extended Kalman Filter)
    ekf_variance = round(random.uniform(0.01, 0.05), 4)

    # Scan range for perception
    scan_range = 8
    
    if random.random() < 0.30:
        dx = random.randint(-scan_range//2, scan_range//2)
        dy = random.randint(-scan_range//2, scan_range//2)
        
        # Aracın tam tekerleğinin altına veya çok dibine engel atmasını engelle
        if abs(dx) <= 1 and abs(dy) <= 1:
            dx += 2 if dx >= 0 else -2
            dy += 2 if dy >= 0 else -2
            
        nx, ny = rover_x + dx, rover_y + dy
        
        if 0 <= nx < width and 0 <= ny < height:
            if not grid[ny][nx]['is_obstacle']:
                grid[ny][nx]['is_obstacle'] = True
                grid[ny][nx]['rock'] = 1.0 
                grid[ny][nx]['elevation'] += 0.3
                
                detected_objects.append({
                    "x": nx,
                    "y": ny,
                    "type": "REGOLITH_HAZARD (APF Active)",
                    "confidence": round(random.uniform(0.85, 0.99) if primary_sensor == "3D_LIDAR_SLAM" else iqi, 2),
                })
                
    return {
        "status": "success",
        "objects": detected_objects,
        "iqi": iqi,
        "primary_sensor": primary_sensor,
        "ekf_variance": ekf_variance
    }
