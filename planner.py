import heapq
import math

def heuristic(a, b):
    # Octile distance (admissible for 8-way grid)
    dx = abs(a[0] - b[0])
    dy = abs(a[1] - b[1])
    return (dx + dy) + (1.414 - 2) * min(dx, dy)

def calculate_cost(cell):
    w_d = 1.0 # Mesafe ağırlığı (1 hücre)
    w_s = 5.0 # Eğim ağırlığı (Slope)
    w_r = 3.0 # Pürüzlülük ağırlığı (Roughness)
    w_sink = 10.0 # Batma (Sinkage) risk ağırlığı
    
    # C = Sum(Distance * w_d) + (Slope * w_s) + (Roughness * w_r)
    sinkage = calculate_sinkage(cell)
    cost = (w_d) + (cell['slope'] * w_s) + (cell['roughness'] * w_r) + (cell['crater'] * 10) + (cell['rock'] * 8) + (sinkage * w_sink)
    return cost

def calculate_sinkage(cell):
    # Bekker-Wong Theory mock (Regolith deformation)
    base_sinkage = 0.05 
    sinkage = base_sinkage + (cell['slope'] * 0.1) + (cell['roughness'] * 0.05)
    return sinkage

def plan_path(map_data, start, goal, algo='astar'):
    width = map_data['width']
    height = map_data['height']
    grid = map_data['grid']
    
    # Clamp coordinate to bounds to prevent "Invalid start bounds" error
    start_x = max(0, min(width - 1, start[0]))
    start_y = max(0, min(height - 1, start[1]))
    goal_x = max(0, min(width - 1, goal[0]))
    goal_y = max(0, min(height - 1, goal[1]))
    
    start = [start_x, start_y]
    goal = [goal_x, goal_y]
    
    # Push start and goal off obstacles if they landed on one
    def find_nearest_safe(cx, cy):
        if not grid[cy][cx]['is_obstacle']: return cx, cy
        queue = [(cx, cy)]
        visited = set([(cx, cy)])
        while queue:
            curr_x, curr_y = queue.pop(0)
            for nx, ny in [(curr_x+1, curr_y), (curr_x-1, curr_y), (curr_x, curr_y+1), (curr_x, curr_y-1)]:
                if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                    if not grid[ny][nx]['is_obstacle']:
                        return nx, ny
                    visited.add((nx, ny))
                    queue.append((nx, ny))
        return cx, cy

    start[0], start[1] = find_nearest_safe(start[0], start[1])
    goal[0], goal[1] = find_nearest_safe(goal[0], goal[1])
        
    start_tuple = (start[0], start[1])
    goal_tuple = (goal[0], goal[1])
    
    # State: x, y, dx (last change x), dy (last change y)
    start_state = (start[0], start[1], 0, 0) 
    
    frontier = []
    heapq.heappush(frontier, (0, start_state))
    came_from = {start_state: None}
    cost_so_far = {start_state: 0}
    
    final_state = None
    
    while frontier:
        current_priority, current_state = heapq.heappop(frontier)
        x, y, px, py = current_state
        
        if (x, y) == goal_tuple:
            final_state = current_state
            break
            
        neighbors = [
            (x+1, y, 1, 0), (x-1, y, -1, 0), (x, y+1, 0, 1), (x, y-1, 0, -1),
            (x+1, y+1, 1, 1), (x-1, y-1, -1, -1), (x+1, y-1, 1, -1), (x-1, y+1, -1, 1)
        ]
        
        for nx, ny, dx, dy in neighbors:
            if 0 <= nx < width and 0 <= ny < height:
                cell = grid[ny][nx]
                if cell['is_obstacle']:
                    continue
                    
                move_cost = calculate_cost(cell)
                # Diagonal distance penalty
                if dx != 0 and dy != 0:
                    move_cost *= 1.414
                    
                # 3. Aşama Uygulaması: D* Lite ve Yapay Potansiyel Alanlar (APF)
                if algo == 'dlite' or algo == 'astar' or algo == 'hybrid_astar': 
                    if px != 0 or py != 0:
                        dot = px*dx + py*dy
                        mag1 = math.sqrt(px*px + py*py)
                        mag2 = math.sqrt(dx*dx + dy*dy)
                        # Cosine similarity tells us the turning angle difference
                        cos_theta = dot / (mag1 * mag2 + 1e-8)
                        # Penalty for sharp turns
                        if cos_theta < 0.9: 
                            move_cost *= 2.0 
                        if cos_theta < 0.0:
                            move_cost *= 4.0
                            
                    # YPA (Yapay Potansiyel Alanlar) İtici Gücü: Engellere çok yakın hücrelere ekstra ceza (Repulsive force)
                    repulsive_cost = 0
                    for ox in range(nx-1, nx+2):
                        for oy in range(ny-1, ny+2):
                            if 0 <= ox < width and 0 <= oy < height:
                                if grid[oy][ox]['is_obstacle']:
                                    repulsive_cost += 10.0 # Engel çevresinden kaçınma
                    move_cost += repulsive_cost
                            
                new_cost = cost_so_far[current_state] + move_cost
                new_state = (nx, ny, dx, dy)
                
                # 4D state mapping ensures we don't have KeyError between pop and push
                if new_state not in cost_so_far or new_cost < cost_so_far[new_state]:
                    cost_so_far[new_state] = new_cost
                    priority = new_cost + heuristic((nx, ny), goal_tuple)
                    
                    heapq.heappush(frontier, (priority, new_state))
                    came_from[new_state] = current_state
                    
    # Reconstruct path
    path = []
    if final_state:
        curr = final_state
        while curr:
            path.append((curr[0], curr[1]))
            curr = came_from[curr]
        path.reverse()
    else:
        # Fallback: if no strict safe path, run Dijkstra ignoring obstacles but high cost
        return fallback_plan_path(map_data, start_tuple, goal_tuple, algo)
        
    return {"path": path, "total_cost": cost_so_far.get(final_state, -1)}

def fallback_plan_path(map_data, start, goal, algo):
    # Same as A* but ignores 'is_obstacle' to guarantee a path (even if dangerous)
    # The rover will attempt to drive over obstacles but at massive cost.
    width = map_data['width']
    height = map_data['height']
    grid = map_data['grid']
    start_state = (start[0], start[1], 0, 0) 
    
    frontier = []
    heapq.heappush(frontier, (0, start_state))
    came_from = {start_state: None}
    cost_so_far = {start_state: 0}
    final_state = None
    
    while frontier:
        current_priority, current_state = heapq.heappop(frontier)
        x, y, px, py = current_state
        if (x, y) == goal:
            final_state = current_state
            break
            
        neighbors = [
            (x+1, y, 1, 0), (x-1, y, -1, 0), (x, y+1, 0, 1), (x, y-1, 0, -1),
            (x+1, y+1, 1, 1), (x-1, y-1, -1, -1), (x+1, y-1, 1, -1), (x-1, y+1, -1, 1)
        ]
        
        for nx, ny, dx, dy in neighbors:
            if 0 <= nx < width and 0 <= ny < height:
                cell = grid[ny][nx]
                move_cost = calculate_cost(cell)
                if cell['is_obstacle']:
                    move_cost += 500.0 # Huge penalty for hazards
                    
                if dx != 0 and dy != 0: move_cost *= 1.414
                
                if algo in ['hybrid_astar', 'astar', 'dlite']:
                    if px != 0 or py != 0:
                        dot = px*dx + py*dy
                        mag1 = math.sqrt(px*px + py*py)
                        mag2 = math.sqrt(dx*dx + dy*dy)
                        cos_theta = dot / (mag1 * mag2 + 1e-8)
                        if cos_theta < 0.9: move_cost *= 2.0 
                        if cos_theta < 0.0: move_cost *= 4.0
                            
                    repulsive_cost = 0
                    for ox in range(nx-1, nx+2):
                        for oy in range(ny-1, ny+2):
                            if 0 <= ox < width and 0 <= oy < height:
                                if grid[oy][ox]['is_obstacle']:
                                    repulsive_cost += 10.0
                    move_cost += repulsive_cost
                            
                new_cost = cost_so_far[current_state] + move_cost
                new_state = (nx, ny, dx, dy)
                
                if new_state not in cost_so_far or new_cost < cost_so_far[new_state]:
                    cost_so_far[new_state] = new_cost
                    priority = new_cost + heuristic((nx, ny), goal)
                    heapq.heappush(frontier, (priority, new_state))
                    came_from[new_state] = current_state
                    
    path = []
    if final_state:
        curr = final_state
        while curr:
            path.append((curr[0], curr[1]))
            curr = came_from[curr]
        path.reverse()
    else:
        return {"path": [], "total_cost": -1}
        
    return {"path": path, "total_cost": cost_so_far.get(final_state, -1), "warning": "HAZARD PATH - NO SAFE ALTERNATIVE"}
