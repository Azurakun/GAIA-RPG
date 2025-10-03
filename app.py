import os
import json
import uuid
import math
from datetime import datetime
import google.generativeai as genai
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-2.5-pro')

app = Flask(__name__)

SAVES_DIR = "saves"
if not os.path.exists(SAVES_DIR):
    os.makedirs(SAVES_DIR)

# --- Core Game Classes ---
class Player:
    def __init__(self, name, hp=100, mana=50, currency=None, inventory=None, skills=None, stats=None):
        self.name = name; self.hp = hp; self.max_hp = hp; self.mana = mana; self.max_mana = mana
        self.level = 1; self.xp = 0; self.xp_to_next_level = 100
        # --- UPDATED: Added dexterity and made stats customizable ---
        self.stats = stats if stats is not None else {"strength": 10, "agility": 10, "intelligence": 10, "dexterity": 10}
        self.currency = currency if currency is not None else {"gold": 0, "silver": 0, "copper": 20}
        self.inventory = inventory if inventory is not None else {"Health Potion": 2}
        self.skills = skills if skills is not None else {"Slash": {"cost": 5, "damage": 12}, "Fireball": {"cost": 15, "damage": 25}}
        self.equipped = {"weapon": "Rusty Sword", "armor": "Leather Tunic"}
        self.level_up_pending = False # Flag for the frontend

    def to_dict(self): return self.__dict__

class GameState:
    def __init__(self, player, story_memory=None, location=""):
        self.player = player; self.story_memory = story_memory if story_memory is not None else []
        self.current_location = location; self.current_enemies = []
    def to_dict(self): return {"player": self.player.to_dict(), "story_memory": self.story_memory, "current_location": self.current_location, "current_enemies": self.current_enemies}

# --- Gemini API Prompt Template (Updated) ---
def get_base_prompt_template():
    return """
    You are a Dungeon Master for a text-based RPG. Your entire response MUST be a single, valid JSON object.
    - Award experience points (XP) for overcoming challenges. A small challenge might be 10-20 XP, a major one 50-100 XP.
    - Player stats are: strength, agility, intelligence, dexterity.
    - JSON keys: "story_text", "choices", "player_updates" (can include "xp": value), "game_updates", "memory_additions".
    """

def generate_ai_response(current_game_state_dict, player_action):
    system_instruction = get_base_prompt_template(); prompt = f"Current game state:\n{json.dumps(current_game_state_dict, indent=2)}\n\nPlayer's action:\n\"{player_action}\"\n\nGenerate the next part of the story."
    raw_response_text = "";
    try:
        response = model.generate_content([system_instruction, prompt], generation_config=genai.types.GenerationConfig(temperature=0.8)); raw_response_text = response.text
        cleaned_response = raw_response_text.strip().replace("```json", "").replace("```", ""); return json.loads(cleaned_response)
    except Exception as e:
        print(f"--- ERROR PARSING AI RESPONSE ---\nError: {e}\n--- RAW AI RESPONSE TEXT ---\n{raw_response_text}\n---------------------------------")
        return {"story_text": "(The AI failed to respond correctly. Please try a different action.)", "choices": ["Look around", "Check my inventory", "Wait"], "player_updates": {}, "game_updates": {}, "memory_additions": "The player felt a strange magical interference."}

# --- Flask Routes ---
@app.route('/')
def index(): return render_template('index.html')

# --- Save/Load API (Unchanged) ---
@app.route('/saves', methods=['GET'])
def get_saves():
    # ... (code is unchanged)
    saves = {};
    for filename in os.listdir(SAVES_DIR):
        if filename.endswith(".json"):
            save_id = filename.replace(".json", "")
            try:
                with open(os.path.join(SAVES_DIR, filename), 'r') as f: saves[save_id] = json.load(f)
            except Exception as e: print(f"Error loading save file {filename}: {e}")
    return jsonify(saves)

@app.route('/save_game', methods=['POST'])
def save_game_route():
    # ... (code is unchanged)
    data = request.json; save_id = data.get('save_id'); game_state = data.get('game_state')
    if not save_id or not game_state: return jsonify({"error": "Missing save_id or game_state"}), 400
    filename = f"{save_id}.json"
    try:
        with open(os.path.join(SAVES_DIR, filename), 'w') as f: json.dump(game_state, f, indent=4)
        return jsonify({"success": True, "message": "Game saved."})
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/delete_save/<save_id>', methods=['DELETE'])
def delete_save_route(save_id):
    # ... (code is unchanged)
    filename = f"{save_id}.json"; filepath = os.path.join(SAVES_DIR, filename)
    if os.path.exists(filepath):
        try: os.remove(filepath); return jsonify({"success": True, "message": "Save deleted."})
        except Exception as e: return jsonify({"error": str(e)}), 500
    else: return jsonify({"error": "Save not found"}), 404

# --- /start_game (Unchanged) ---
@app.route('/start_game', methods=['POST'])
def start_game():
    # ... (code is unchanged)
    data = request.json; player_name = data.get('name', 'Adventurer'); scenario_id = data.get('scenario_id')
    player = None; initial_story = ""; initial_choices = []
    if scenario_id == 'tavern': player = Player(player_name, currency={"gold": 0, "silver": 0, "copper": 15}, inventory={"Rusty Dagger": 1}); initial_story = "You awaken in a dimly lit tavern..."; initial_choices = ["Look around the tavern", "Talk to the bartender", "Check my pockets"]
    elif scenario_id == 'forest': player = Player(player_name, hp=120, inventory={"Sturdy Axe": 1, "Health Potion": 1}); initial_story = "You stand at the edge of a vast, enchanted forest..."; initial_choices = ["Follow the path", "Examine the plants", "Listen to the whispers"]
    elif scenario_id == 'prison': player = Player(player_name, hp=80, mana=20, inventory={"Ragged Tunic": 1}); initial_story = "The cold, damp stone floor is your bed..."; initial_choices = ["Try to reach the key", "Yell for the guard", "Examine the cell"]
    elif scenario_id == 'custom':
        custom_prompt = data.get('custom_text', 'A lone adventurer starts a journey.')
        try:
            scenario_gen_prompt = f"""Create a starting scenario for an RPG based on: "{custom_prompt}". Respond in valid JSON with keys: "story_text", "choices", and "player_data" (with hp, mana, currency, inventory)."""; response = model.generate_content(scenario_gen_prompt); ai_data = json.loads(response.text)
            pd = ai_data['player_data']; player = Player(player_name, hp=pd['hp'], mana=pd['mana'], currency=pd['currency'], inventory=pd['inventory']); initial_story = ai_data['story_text']; initial_choices = ai_data['choices']
        except Exception as e:
            print(f"Error generating custom scenario: {e}"); player = Player(player_name); initial_story = "The threads of fate tangle..."; initial_choices = ["Imagine a forest", "Imagine a city", "Imagine an ocean"]
    if not player: return jsonify({"error": "Invalid scenario"}), 400
    save_id = str(uuid.uuid4()); game_state = GameState(player, story_memory=[initial_story], location="start")
    initial_save_data = game_state.to_dict(); initial_save_data['lastSaved'] = datetime.now().isoformat()
    with open(os.path.join(SAVES_DIR, f"{save_id}.json"), 'w') as f: json.dump(initial_save_data, f, indent=4)
    return jsonify({"story_text": initial_story, "choices": initial_choices, "game_state": game_state.to_dict(), "save_id": save_id})

# --- UPDATED: /process_action to handle level-ups ---
@app.route('/process_action', methods=['POST'])
def process_action():
    data = request.json
    game_state_dict = data.get('game_state')
    action = data.get('action')
    if not game_state_dict or not action: return jsonify({"error": "Missing game state or action"}), 400
    
    ai_response = generate_ai_response(game_state_dict, action)
    
    player_updates = ai_response.get("player_updates", {})
    if "xp" in player_updates:
        current_xp = game_state_dict['player']['xp']
        xp_to_next = game_state_dict['player']['xp_to_next_level']
        new_xp = current_xp + player_updates["xp"]
        
        if new_xp >= xp_to_next:
            ai_response["level_up_pending"] = True # Signal frontend to show level up menu

    return jsonify(ai_response)

# --- NEW: API Endpoint for leveling up a stat ---
@app.route('/level_up', methods=['POST'])
def level_up_route():
    data = request.json
    game_state_dict = data.get('game_state')
    stat_to_increase = data.get('stat')
    if not game_state_dict or not stat_to_increase:
        return jsonify({"error": "Missing game_state or stat"}), 400

    player_dict = game_state_dict['player']
    
    # Apply level up logic
    player_dict['level'] += 1
    player_dict['xp'] -= player_dict['xp_to_next_level']
    player_dict['xp_to_next_level'] = math.floor(player_dict['xp_to_next_level'] * 1.5)
    
    # Increase the chosen stat
    if stat_to_increase in player_dict['stats']:
        player_dict['stats'][stat_to_increase] += 1
    
    # Increase max HP and Mana
    player_dict['max_hp'] += 10
    player_dict['max_mana'] += 5
    player_dict['hp'] = player_dict['max_hp'] # Full heal on level up
    player_dict['mana'] = player_dict['max_mana']

    player_dict['level_up_pending'] = False # Reset the flag

    return jsonify({"updated_player": player_dict})

@app.route('/get_suggestion', methods=['POST'])
def get_suggestion():
    # ... (code is unchanged)
    game_state_dict = request.json.get('game_state')
    if not game_state_dict: return jsonify({"error": "Game not started"}), 400
    prompt = f"Game state: {json.dumps(game_state_dict)}"; suggestion = "Perhaps looking closer at your surroundings could reveal a hidden detail."
    try: response = model.generate_content(["You are a helpful game assistant. The player is stuck. Provide a creative hint.", prompt]); suggestion = response.text
    except Exception as e: print(f"Error getting suggestion: {e}")
    return jsonify({"suggestion": suggestion})

if __name__ == '__main__':
    app.run(debug=True)

