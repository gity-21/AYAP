import random
import math
import urllib.request
import ssl
import numpy as np
import cv2

def fetch_nasa_trek_dem(width, height):
    """
    NASA Planetary Data/Trek API mantığı:
    Ay'ın (veya diğer gök cisimlerinin) yüksek çözünürlüklü DEM 
    (Digital Elevation Model) haritalarını çekmek için WMS / WMTS protokolleri kullanılır.
    Bu servisler, verilen koordinat sınırları (Bounding Box - BBOX) içerisini
    belirli piksel (WIDTHxHEIGHT) boyutlarında raster (piksel imajı) olarak döndürür.
    Biz bu pikselleri 0-255 arasından 0.0-1.0 aralığına normalize edip 
    grid'deki 'elevation' verisine çeviririz.
    """
    # Ay yüzeyinde rastgele bir konum seç (Ekvator bölgesinden +/- 20 derece enlem)
    lat = random.uniform(-20.0, 20.0)
    lon = random.uniform(-180.0, 180.0)
    
    # Scale physical span relative to resolution. Baseline: 50x50 = 2.0 degrees
    span = (width / 50.0) * 2.0
    bbox = f"{lon},{lat},{lon+span},{lat+span}"
    
    # NASA Apollo/LROC WMS endpoint
    # lroc_color_dem katmanı (layer) Lunar yüzey yükselti haritasını ifade eder
    url = (
        f"https://wms.lroc.asu.edu/cgi-bin/wms?"
        f"SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&"
        f"LAYERS=lroc_color_dem&BBOX={bbox}&"
        f"WIDTH={width}&HEIGHT={height}&FORMAT=image/jpeg"
    )
    
    req = urllib.request.Request(url, headers={'User-Agent': 'LunarSafeNav/1.0'})
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # OGC WMS servislerinde yaşanabilen SSL sorunlarını aşmak için
    
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as response:
            image_data = response.read()
            # İndirilen jpeg verisini NumPy array'e çevir, OpenCV ile gri tonlamalı oku
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            
            if img is not None and img.shape == (height, width):
                print(f"[NASA API] BBOX({bbox}) bölgesinden gerçek DEM verisi başarıyla aktarıldı.")
                import base64
                # Base64 string for 3D engine texture
                b64_img = "data:image/jpeg;base64," + base64.b64encode(image_data).decode('utf-8')
                
                # Piksel parlaklığını (0-255) yükseklik modeline (0.0-1.0) dönüştür
                elev_data = img.astype(float) / 255.0
                return elev_data.tolist(), b64_img
    except Exception as e:
        print(f"[NASA API] Gerçek DEM verisi çekilemedi (Timeout/Bağlantı). Prosedürel jeneratöre geçiliyor. Hata: {e}")
        pass
    
    return None, None

def generate_lunar_map(width=50, height=50):
    grid = []
    
    # 1. Aşama: NASA'nın API'si (veya entegre Planetary WMS) üzerinden GERÇEK harita sorgula
    elevation, texture_b64 = fetch_nasa_trek_dem(width, height)
    
    # Eğer API zaman aşımına uğrar veya yanıt vermezse, yedek (fallback) otonom jenerasyon devrede
    if elevation is None:
        elevation = [[0 for _ in range(width)] for _ in range(height)]
        for y in range(height):
            for x in range(width):
                nx = x/width - 0.5
                ny = y/height - 0.5
                e = (1.0 * math.sin(5 * nx) * math.cos(5 * ny) + 
                     0.5 * math.sin(10 * nx + 1) * math.cos(10 * ny + 2) +
                     0.25 * math.sin(20 * nx + 3) * math.cos(20 * ny + 4))
                e = e / (1.0 + 0.5 + 0.25)
                # Normalize to 0-1
                elevation[y][x] = max(0, min(1, (e + 1.0) / 2.0))

    for y in range(height):
        row = []
        for x in range(width):
            h_val = elevation[y][x]
            # slope estimation via discrete gradient
            slope = 0
            if 0 < x < width-1 and 0 < y < height-1:
                dx = (elevation[y][x+1] - elevation[y][x-1]) / 2.0
                dy = (elevation[y+1][x] - elevation[y-1][x]) / 2.0
                slope = math.sqrt(dx*dx + dy*dy) * 5.0 # scale factor up to 1.0
                
            roughness = random.uniform(0.0, 0.1) + h_val * 0.15 # Higher elevation is slightly rougher
            
            row.append({
                'elevation': h_val,
                'slope': min(1.0, slope),
                'roughness': min(1.0, roughness),
                'crater': 0.0,
                'rock': 0.0,
                'is_obstacle': False,
                'x': x,
                'y': y
            })
        grid.append(row)
        
    # NASA Apollo / LRO Crater Gen
    # Gerçekçi ve daha büyük krater yapıları ekleriz.
    num_craters = int((width * height) / 150)
    for _ in range(num_craters):
        cx = random.randint(0, width - 1)
        cy = random.randint(0, height - 1)
        radius = random.randint(3, 8)
        
        for y in range(max(0, cy - radius), min(height, cy + radius + 1)):
            for x in range(max(0, cx - radius), min(width, cx + radius + 1)):
                dist = math.sqrt((x - cx)**2 + (y - cy)**2)
                if dist <= radius:
                    intensity = (1.0 - (dist / radius))
                    grid[y][x]['crater'] = min(1.0, grid[y][x]['crater'] + intensity)
                    # Crater digs into elev, but lip rises slightly
                    if dist > radius * 0.7:
                        grid[y][x]['elevation'] += 0.1 # crater rim
                        grid[y][x]['slope'] += 0.3
                    else:
                        grid[y][x]['elevation'] -= intensity * 0.3 # crater basin
                        if dist < radius * 0.3:
                            grid[y][x]['slope'] += 0.5 # steep center basin

    # Kayalar / Rocks
    num_rocks = int((width * height) / 80)
    for _ in range(num_rocks):
        rx, ry = random.randint(0, width - 1), random.randint(0, height - 1)
        grid[ry][rx]['rock'] = 1.0
        grid[ry][rx]['is_obstacle'] = True
        grid[ry][rx]['elevation'] += 0.2
        
    # High steep obstacles automatically block path
    for y in range(height):
        for x in range(width):
            if grid[y][x]['slope'] > 0.8:
                grid[y][x]['is_obstacle'] = True
                
    # Ensure start and end are safe bounds
    for x in range(5):
        for y in range(5):
             grid[y][x]['is_obstacle'] = False
             grid[y][x]['slope'] = 0.0
             grid[y][x]['crater'] = 0.0
    for x in range(width-5, width):
        for y in range(height-5, height):
             grid[y][x]['is_obstacle'] = False
             grid[y][x]['slope'] = 0.0
             grid[y][x]['crater'] = 0.0
              
    return {"width": width, "height": height, "grid": grid, "texture_b64": texture_b64 if 'texture_b64' in locals() else None}
