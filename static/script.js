document.addEventListener('DOMContentLoaded', () => {
    // --- Page Sections ---
    const startScreen = document.getElementById('start-screen');
    const mainGameUI = document.getElementById('main-game-ui');

    // --- In-Game Elements ---
    const storyLog = document.getElementById('story-log');
    const actionInput = document.getElementById('action-input');
    const submitBtn = document.getElementById('submit-action');
    const choicesArea = document.getElementById('choices-area');

    // --- Player Stats Elements ---
    const playerNameDisplay = document.getElementById('player-name');
    const hpBar = document.getElementById('hp-bar');
    const hpText = document.getElementById('hp-text');
    const manaBar = document.getElementById('mana-bar');
    const manaText = document.getElementById('mana-text');
    const goldAmount = document.getElementById('gold-amount');
    const silverAmount = document.getElementById('silver-amount');
    const copperAmount = document.getElementById('copper-amount');

    // --- NEW: Navigation and Modal Elements ---
    const detailsNavButtons = document.querySelectorAll('.details-nav-btn');
    const levelUpModal = document.getElementById('level-up-modal');
    const levelUpChoices = document.getElementById('level-up-choices');
    const detailsModal = document.getElementById('details-modal');
    const detailsModalTitle = document.getElementById('details-modal-title');
    const detailsModalContent = document.getElementById('details-modal-content');
    const detailsModalCloseBtn = document.getElementById('details-modal-close-btn');
    
    // --- Game State Variables ---
    let currentGameState = null;
    let currentSaveId = null;

    // --- (Rest of the startup and save/load logic is unchanged) ---
    const mainMenu = document.getElementById('main-menu');
    const scenarioChooser = document.getElementById('scenario-chooser');
    const saveSlotsList = document.getElementById('save-slots-list');
    const newGameBtn = document.getElementById('new-game-btn');
    const nameInput = document.getElementById('player-name-input');
    const scenarioBtns = document.querySelectorAll('.scenario-btn');
    const customScenarioArea = document.getElementById('custom-scenario-area');
    const customScenarioInput = document.getElementById('custom-scenario-input');
    const startCustomGameBtn = document.getElementById('start-custom-game-btn');
    const backToMenuBtn = document.getElementById('back-to-menu-btn');
    const suggestionBtn = document.getElementById('suggestion-btn');
    const saveGameBtn = document.getElementById('save-game-btn');
    const returnToMenuBtn = document.getElementById('return-to-menu-btn');

    async function deleteSaveFromServer(saveId) {
        const response = await fetch(`/delete_save/${saveId}`, { method: 'DELETE' });
        if (response.ok) { renderMainMenu(); } 
        else { alert('Error: Could not delete the save file on the server.'); }
    }
    function showScreen(screen) {
        startScreen.classList.toggle('hidden', screen !== 'start');
        mainGameUI.classList.toggle('hidden', screen !== 'game');
        if (screen === 'start') { mainMenu.classList.remove('hidden'); scenarioChooser.classList.add('hidden'); }
    }
    async function renderMainMenu() {
        const response = await fetch('/saves');
        const saves = await response.json();
        saveSlotsList.innerHTML = '';
        const sortedSaves = Object.entries(saves).sort((a, b) => new Date(b[1].lastSaved) - new Date(a[1].lastSaved));
        if (sortedSaves.length === 0) { saveSlotsList.innerHTML = '<li>No saved games yet.</li>'; return; }
        for (const [saveId, gameState] of sortedSaves) {
            const li = document.createElement('li');
            li.className = 'save-slot';
            li.innerHTML = `<div class="save-slot-info"><span class="player-name">${gameState.player.name}</span><span class="save-date">Saved: ${new Date(gameState.lastSaved).toLocaleString()}</span></div><div class="save-slot-actions"><button class="load-btn">Load</button><button class="delete-btn">Delete</button></div>`;
            li.querySelector('.load-btn').addEventListener('click', () => loadGame(saveId, gameState));
            li.querySelector('.delete-btn').addEventListener('click', () => { if(confirm('Are you sure you want to permanently delete this save?')) { deleteSaveFromServer(saveId); } });
            saveSlotsList.appendChild(li);
        }
    }
    function updateFullUI(gameState) {
        storyLog.innerHTML = '';
        gameState.story_memory.forEach(entry => {
            const storyTurn = document.createElement('div');
            storyTurn.className = 'story-turn';
            storyTurn.innerHTML = `<p>${entry}</p>`;
            storyLog.appendChild(storyTurn);
        });
        updatePlayerStats(gameState.player);
        updateChoices([]);
        scrollToBottom();
    }
    function loadGame(saveId, gameState) {
        currentSaveId = saveId;
        currentGameState = gameState;
        showScreen('game');
        updateFullUI(currentGameState);
        processAction("Continue the story.");
    }
    async function startNewGame(scenario_id, custom_text = null) {
        const name = nameInput.value.trim() || 'Adventurer';
        if (!name) { alert('Please enter a character name.'); return; }
        const body = { name, scenario_id };
        if (custom_text) body.custom_text = custom_text;
        storyLog.innerHTML = "<p>The threads of fate are weaving your story...</p>";
        showScreen('game');
        const response = await fetch('/start_game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        currentSaveId = data.save_id;
        currentGameState = data.game_state;
        currentGameState.lastSaved = new Date().toISOString(); 
        updateFullUI(currentGameState);
        updateChoices(data.choices);
    }
    
    async function processAction(action) {
        if (!action) return;
        displayPlayerAction(action);
        actionInput.value = '';

        const response = await fetch('/process_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, game_state: currentGameState }),
        });
        const aiResponse = await response.json();
        
        const { story_text, choices, player_updates = {}, game_updates = {}, memory_additions } = aiResponse;
        
        if (story_text) {
            const storyTurn = document.createElement('div');
            storyTurn.className = 'story-turn';
            storyTurn.innerHTML = `<p>${story_text}</p>`;
            storyLog.appendChild(storyTurn);
        }
        
        if(player_updates.hp !== undefined) currentGameState.player.hp = player_updates.hp;
        if(player_updates.mana !== undefined) currentGameState.player.mana = player_updates.mana;
        if(player_updates.xp) currentGameState.player.xp += player_updates.xp;
        if (player_updates.currency_updates) { for (const [c, a] of Object.entries(player_updates.currency_updates)) { currentGameState.player.currency[c] += a; } }
        if (player_updates.new_item) { const i = player_updates.new_item; currentGameState.player.inventory[i] = (currentGameState.player.inventory[i] || 0) + 1; }
        if(game_updates.new_location) currentGameState.current_location = game_updates.new_location;
        if (memory_additions) { currentGameState.story_memory.push(memory_additions); if (currentGameState.story_memory.length > 20) currentGameState.story_memory.shift(); }

        if (aiResponse.level_up_pending) {
            currentGameState.player.level_up_pending = true;
            showLevelUpModal();
        }

        updatePlayerStats(currentGameState.player);
        updateChoices(choices);
        scrollToBottom();
    }

    // --- Modal Logic ---
    function showLevelUpModal() {
        levelUpChoices.innerHTML = '';
        const stats = currentGameState.player.stats;
        for (const stat in stats) {
            const button = document.createElement('button');
            button.className = 'level-up-btn';
            button.textContent = `${stat.charAt(0).toUpperCase() + stat.slice(1)} (+1)`;
            button.dataset.stat = stat;
            button.addEventListener('click', handleLevelUpChoice);
            levelUpChoices.appendChild(button);
        }
        levelUpModal.classList.remove('hidden');
    }

    async function handleLevelUpChoice(event) {
        const stat = event.target.dataset.stat;
        const response = await fetch('/level_up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_state: currentGameState, stat: stat })
        });
        const data = await response.json();
        currentGameState.player = data.updated_player;
        levelUpModal.classList.add('hidden');
        updatePlayerStats(currentGameState.player);
    }

    // --- NEW: Generic Details Modal Logic ---
    function openDetailsModal(panelType) {
        const player = currentGameState.player;
        let title = '';
        let contentHTML = '<ul class="details-list">';

        if (panelType === 'character') {
            title = 'Character Details';
            contentHTML += `
                <li><span class="stat-name">Level:</span> ${player.level || 1}</li>
                <li><span class="stat-name">XP:</span> ${player.xp || 0} / ${player.xp_to_next_level || 100}</li>
                ${Object.entries(player.stats || {}).map(([stat, value]) => `
                    <li><span class="stat-name">${stat.charAt(0).toUpperCase() + stat.slice(1)}:</span> ${value}</li>
                `).join('')}`;
        } else if (panelType === 'inventory') {
            title = 'Inventory';
            if (Object.keys(player.inventory || {}).length === 0) {
                contentHTML += '<li>Your inventory is empty.</li>';
            } else {
                for (const [item, count] of Object.entries(player.inventory || {})) {
                    contentHTML += `<li>${item} (x${count})</li>`;
                }
            }
        } else if (panelType === 'skills') {
            title = 'Skills';
            if (Object.keys(player.skills || {}).length === 0) {
                contentHTML += '<li>You have no skills.</li>';
            } else {
                for (const [skill, details] of Object.entries(player.skills || {})) {
                    contentHTML += `<li>${skill} (Cost: ${details.cost} Mana)</li>`;
                }
            }
        }

        contentHTML += '</ul>';
        detailsModalTitle.textContent = title;
        detailsModalContent.innerHTML = contentHTML;
        detailsModal.classList.remove('hidden');
    }

    function closeDetailsModal() {
        detailsModal.classList.add('hidden');
    }

    // --- UI UPDATE FUNCTIONS ---
    function updateChoices(choices = []) {
        choicesArea.innerHTML = '';
        choices.forEach(choice => {
            const choiceBtn = document.createElement('button');
            choiceBtn.className = 'choice-btn';
            let choiceText;
            if (typeof choice === 'string') { choiceText = choice; } 
            else if (typeof choice === 'object' && choice !== null) { choiceText = Object.values(choice).find(val => typeof val === 'string') || '[Invalid Choice]'; } 
            else { choiceText = '[Invalid Choice]'; }
            choiceBtn.textContent = choiceText;
            choiceBtn.addEventListener('click', () => processAction(choiceText));
            choicesArea.appendChild(choiceBtn);
        });
    }

    function displayPlayerAction(action) {
        const actionElement = document.createElement('p');
        actionElement.innerHTML = `<strong>> ${action}</strong>`;
        storyLog.appendChild(actionElement);
        scrollToBottom();
    }

    function updatePlayerStats(player) {
        playerNameDisplay.textContent = player.name;
        hpBar.style.width = `${(player.hp / player.max_hp) * 100}%`;
        hpText.textContent = `${player.hp || 0} / ${player.max_hp || 100}`;
        manaBar.style.width = `${(player.mana / player.max_mana) * 100}%`;
        manaText.textContent = `${player.mana || 0} / ${player.max_mana || 100}`;
        goldAmount.textContent = player.currency?.gold || 0;
        silverAmount.textContent = player.currency?.silver || 0;
        copperAmount.textContent = player.currency?.copper || 0;
    }
    
    function scrollToBottom() { storyLog.scrollTop = storyLog.scrollHeight; }

    // --- EVENT LISTENERS ---
    // (Startup listeners unchanged)
    newGameBtn.addEventListener('click', () => { mainMenu.classList.add('hidden'); scenarioChooser.classList.remove('hidden'); });
    backToMenuBtn.addEventListener('click', () => { scenarioChooser.classList.add('hidden'); mainMenu.classList.remove('hidden'); });
    scenarioBtns.forEach(button => { button.addEventListener('click', (e) => { const id = e.target.dataset.scenarioId; if (id === 'custom') { customScenarioArea.classList.remove('hidden'); } else { startNewGame(id); } }); });
    startCustomGameBtn.addEventListener('click', () => { const text = customScenarioInput.value.trim(); if (text) { startNewGame('custom', text); } else { alert('Please describe your custom scenario.'); } });
    
    // In-Game Listeners
    submitBtn.addEventListener('click', () => processAction(actionInput.value.trim()));
    actionInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') processAction(actionInput.value.trim()); });
    saveGameBtn.addEventListener('click', async () => { if(currentSaveId && currentGameState) { currentGameState.lastSaved = new Date().toISOString(); const response = await fetch('/save_game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ save_id: currentSaveId, game_state: currentGameState }) }); if (response.ok) { saveGameBtn.textContent = 'Saved!'; setTimeout(() => { saveGameBtn.textContent = 'Save Game'; }, 1500); } else { saveGameBtn.textContent = 'Save Failed!'; setTimeout(() => { saveGameBtn.textContent = 'Save Game'; }, 2000); } } });
    returnToMenuBtn.addEventListener('click', () => { if(confirm('Are you sure? Unsaved progress will be lost.')) { showScreen('start'); renderMainMenu(); } });

    // NEW: Modal and Navigation Listeners
    detailsNavButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.dataset.panel;
            openDetailsModal(panel);
        });
    });
    detailsModalCloseBtn.addEventListener('click', closeDetailsModal);

    // --- INITIALIZATION ---
    renderMainMenu();
    showScreen('start');
});

