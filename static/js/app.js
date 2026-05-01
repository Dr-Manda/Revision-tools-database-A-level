let config = {};
let currentMistakes = [];
let currentTabSubject = 'All';
let currentTabTopic = 'All';
let zIndexCounter = 100;
let openWindows = new Set();

// Audio context for click sounds
function playClickSound() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, context.currentTime);
        gain.gain.setValueAtTime(0.05, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start();
        osc.stop(context.currentTime + 0.05);
    } catch (e) { /* Audio might be blocked until user interaction */ }
}

// Global fetch wrapper for Hourglass cursor
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    document.body.classList.add('waiting');
    try {
        return await originalFetch(...args);
    } finally {
        document.body.classList.remove('waiting');
    }
};

// Window Management
function openWindow(winId) {
    const win = document.getElementById(`win-${winId}`);
    if (!win) return;

    if (win.style.display === 'none') {
        win.style.display = 'flex';
        win.style.animation = 'windowSnap 0.2s ease-out forwards';
        openWindows.add(winId);
        addTaskbarTab(winId);
        
        // Default positions if not set
        if (!win.style.top) {
            const offset = openWindows.size * 20;
            win.style.top = (50 + offset) + 'px';
            win.style.left = (50 + offset) + 'px';
        }
    }
    
    bringToFront(winId);
    playClickSound();

    if (winId === 'dashboard') loadMistakes();
    if (winId === 'terminal') updateTerminalStatus();
}

function closeWindow(winId) {
    const win = document.getElementById(`win-${winId}`);
    if (win) {
        win.style.display = 'none';
        openWindows.delete(winId);
        removeTaskbarTab(winId);
    }
}

function minimizeWindow(winId) {
    const win = document.getElementById(`win-${winId}`);
    if (win) {
        win.style.display = 'none';
        document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
    }
}

function maximizeWindow(winId) {
    const win = document.getElementById(`win-${winId}`);
    if (!win) return;
    
    if (win.dataset.maximized === 'true') {
        win.style.top = win.dataset.oldTop;
        win.style.left = win.dataset.oldLeft;
        win.style.width = win.dataset.oldWidth;
        win.style.height = win.dataset.oldHeight;
        win.dataset.maximized = 'false';
        win.classList.remove('maximized');
    } else {
        win.dataset.oldTop = win.style.top;
        win.dataset.oldLeft = win.style.left;
        win.dataset.oldWidth = win.style.width;
        win.dataset.oldHeight = win.style.height;
        
        win.style.top = '0';
        win.style.left = '0';
        win.style.width = '100%';
        win.style.height = 'calc(100% - 28px)';
        win.dataset.maximized = 'true';
        win.classList.add('maximized');
    }
}

function bringToFront(winId) {
    const win = document.getElementById(`win-${winId}`);
    if (win) {
        zIndexCounter++;
        win.style.zIndex = zIndexCounter;
        document.querySelectorAll('.window').forEach(w => w.classList.remove('active'));
        win.classList.add('active');
        
        document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
        const tab = document.getElementById(`tab-${winId}`);
        if (tab) tab.classList.add('active');
    }
}

function addTaskbarTab(winId) {
    const container = document.getElementById('taskbar-apps');
    if (document.getElementById(`tab-${winId}`)) return;

    const tab = document.createElement('button');
    tab.id = `tab-${winId}`;
    tab.className = 'task-tab active';
    
    let title = 'App';
    const winTitleElem = document.querySelector(`#win-${winId} .window-title span`);
    if (winTitleElem) title = winTitleElem.textContent.split(' - ')[0];

    tab.innerHTML = `<img src="/static/icon-192.png"> <span>${title}</span>`;
    tab.onclick = () => toggleWindow(winId);
    container.appendChild(tab);
}

function removeTaskbarTab(winId) {
    const tab = document.getElementById(`tab-${winId}`);
    if (tab) tab.remove();
}

function toggleWindow(winId) {
    const win = document.getElementById(`win-${winId}`);
    if (win.style.display === 'none' || !win.classList.contains('active')) {
        win.style.display = 'flex';
        bringToFront(winId);
    } else {
        minimizeWindow(winId);
    }
}

// Window Interactions (Drag, Resize, Snap)
function initWindowInteractions() {
    let activeWin = null;
    let mode = null; // 'drag' or 'resize'
    let startPos = { x: 0, y: 0 };
    let startRect = { x: 0, y: 0, w: 0, h: 0 };
    const SNAP_THRESHOLD = 20;

    document.addEventListener('mousedown', (e) => {
        const header = e.target.closest('.window-header');
        const resizeHandle = e.target.closest('.window-body'); // Simple resize from bottom-right area for now
        
        // Bring to front on any click
        const win = e.target.closest('.window');
        if (win) bringToFront(win.id.replace('win-', ''));

        if (header) {
            activeWin = header.closest('.window');
            if (activeWin.dataset.maximized === 'true') return;
            mode = 'drag';
            startPos = { x: e.clientX, y: e.clientY };
            startRect = { 
                x: parseInt(activeWin.style.left) || 0, 
                y: parseInt(activeWin.style.top) || 0 
            };
        } else if (win && e.offsetX > win.clientWidth - 15 && e.offsetY > win.clientHeight - 15) {
            activeWin = win;
            if (activeWin.dataset.maximized === 'true') return;
            mode = 'resize';
            startPos = { x: e.clientX, y: e.clientY };
            startRect = { 
                w: win.clientWidth, 
                h: win.clientHeight 
            };
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!activeWin) return;

        if (mode === 'drag') {
            let nextX = startRect.x + (e.clientX - startPos.x);
            let nextY = startRect.y + (e.clientY - startPos.y);

            // Snapping
            if (Math.abs(nextX) < SNAP_THRESHOLD) nextX = 0;
            if (Math.abs(nextY) < SNAP_THRESHOLD) nextY = 0;
            if (Math.abs(window.innerWidth - (nextX + activeWin.clientWidth)) < SNAP_THRESHOLD) {
                nextX = window.innerWidth - activeWin.clientWidth;
            }
            if (Math.abs((window.innerHeight - 28) - (nextY + activeWin.clientHeight)) < SNAP_THRESHOLD) {
                nextY = (window.innerHeight - 28) - activeWin.clientHeight;
            }

            activeWin.style.left = nextX + 'px';
            activeWin.style.top = nextY + 'px';
        } else if (mode === 'resize') {
            activeWin.style.width = (startRect.w + (e.clientX - startPos.x)) + 'px';
            activeWin.style.height = (startRect.h + (e.clientY - startPos.y)) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        activeWin = null;
        mode = null;
    });
}

// App Initialization
async function init() {
    try {
        const res = await fetch('/api/config');
        config = await res.json();
        populateNavSubjects();
        populateDropdowns();
        populateFilters();
        
        initWindowInteractions();
        initStartMenu();
        initClock();
        initDesktopContext();
        
        openWindow('dashboard');
    } catch (e) {
        console.error("Failed to load config", e);
    }
}

function initDesktopContext() {
    const desktop = document.getElementById('desktop');
    desktop.oncontextmenu = (e) => {
        if (e.target !== desktop) return;
        e.preventDefault();
        // We could show a custom Win95 context menu here
        console.log("Desktop context menu");
    };
}

function initStartMenu() {
    const startBtn = document.getElementById('start-btn');
    const startMenu = document.getElementById('start-menu');
    
    startBtn.onclick = (e) => {
        e.stopPropagation();
        startMenu.style.display = startMenu.style.display === 'none' ? 'flex' : 'none';
        startBtn.classList.toggle('active');
        playClickSound();
    };

    document.addEventListener('click', () => {
        startMenu.style.display = 'none';
        startBtn.classList.remove('active');
    });

    startMenu.onclick = (e) => e.stopPropagation();
}

function initClock() {
    const clock = document.getElementById('tray-clock');
    const update = () => {
        const now = new Date();
        clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    update();
    setInterval(update, 10000);
}

function showShutdownAlert() {
    playClickSound();
    alert("SYSTEM ERROR:\nRevision is eternal.\nYou cannot escape the grind.\n\nIt is now safe to turn off your brain.");
}

function updateTerminalStatus() {
    const status = document.getElementById('terminal-status');
    status.textContent = "Scanning...";
    fetch('/api/mistakes').then(r => r.json()).then(data => {
        const unreviewed = data.filter(m => !m.ai_solution).length;
        if (unreviewed > 0) {
            status.textContent = `Found ${unreviewed} unreviewed uploads. Please run 'Review my uploads' in your terminal.`;
            status.style.color = '#ff0';
        } else {
            status.textContent = "System clean. All uploads reviewed!";
            status.style.color = '#0f0';
        }
    });
}

function populateNavSubjects() {
    const navRowMain = document.querySelector('.nav-row-main');
    config.subjects.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'nav-item';
        const safeSubject = s.replace(/[^a-zA-Z0-9]/g, '');
        btn.id = `navSub_${safeSubject}`;
        btn.onclick = () => switchSubjectTab(s);
        btn.innerHTML = `<span class="nav-icon">📁</span><span>${s}</span>`;
        navRowMain.appendChild(btn);
    });
}

function switchSubjectTab(subject) {
    currentTabSubject = subject;
    currentTabTopic = 'All';
    
    document.querySelectorAll('.nav-row-main .nav-item').forEach(n => n.classList.remove('active'));
    if (subject === 'All') {
        document.getElementById('navDashboard').classList.add('active');
        document.getElementById('navRowTopics').style.display = 'none';
    } else {
        const safeSubject = subject.replace(/[^a-zA-Z0-9]/g, '');
        const tabBtn = document.getElementById(`navSub_${safeSubject}`);
        if (tabBtn) tabBtn.classList.add('active');
        populateNavTopics(subject);
    }

    const subjFilter = document.getElementById('subjectFilter');
    if (subjFilter) subjFilter.value = subject === 'All' ? '' : subject;

    openWindow('dashboard');
    renderMistakes();
}

function populateNavTopics(subject) {
    const rowTopics = document.getElementById('navRowTopics');
    rowTopics.innerHTML = '';
    rowTopics.style.display = 'flex';

    const allBtn = document.createElement('button');
    allBtn.className = 'nav-item nav-item-topic active';
    allBtn.id = 'navTopic_All';
    allBtn.onclick = () => switchTopicTab('All');
    allBtn.innerHTML = `<span>All Topics</span>`;
    rowTopics.appendChild(allBtn);

    if (config.topics[subject]) {
        config.topics[subject].forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'nav-item nav-item-topic';
            const safeTopic = t.replace(/[^a-zA-Z0-9]/g, '');
            btn.id = `navTopic_${safeTopic}`;
            btn.onclick = () => switchTopicTab(t);
            btn.innerHTML = `<span>${t}</span>`;
            rowTopics.appendChild(btn);
        });
    }
}

function switchTopicTab(topic) {
    currentTabTopic = topic;
    document.querySelectorAll('.nav-row-topics .nav-item').forEach(n => n.classList.remove('active'));
    const safeTopic = topic.replace(/[^a-zA-Z0-9]/g, '');
    const tabBtn = document.getElementById(topic === 'All' ? 'navTopic_All' : `navTopic_${safeTopic}`);
    if (tabBtn) tabBtn.classList.add('active');
    renderMistakes();
}

function populateDropdowns() {
    const subjectDatalists = [document.getElementById('subjectsList'), document.getElementById('editSubjectsList')];
    const diffSelects = [document.getElementById('difficulty'), document.getElementById('editDifficulty')];

    config.subjects.forEach(s => {
        subjectDatalists.forEach(dl => {
            const opt = document.createElement('option');
            opt.value = s; dl.appendChild(opt);
        });
    });

    config.difficulties.forEach(d => {
        diffSelects.forEach(sel => {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d; sel.appendChild(opt);
        });
    });

    document.getElementById('subject').addEventListener('input', (e) => updateTopics(e.target.value, 'topicsList'));
    document.getElementById('editSubject').addEventListener('input', (e) => updateTopics(e.target.value, 'editTopicsList'));
}

function updateTopics(subject, targetId, currentTopic = '') {
    const topicDatalist = document.getElementById(targetId);
    topicDatalist.innerHTML = '';
    if (config.topics[subject]) {
        config.topics[subject].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            topicDatalist.appendChild(opt);
        });
    }
    if (targetId === 'editTopicsList') {
        document.getElementById('editTopic').value = currentTopic;
    }
}

function populateFilters() {
    const filter = document.getElementById('subjectFilter');
    const diffFilter = document.getElementById('difficultyFilter');
    
    config.subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s; filter.appendChild(opt);
    });
    
    config.difficulties.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d; diffFilter.appendChild(opt);
    });

    filter.addEventListener('change', () => renderMistakes());
    diffFilter.addEventListener('change', () => renderMistakes());
    document.getElementById('sortFilter').addEventListener('change', () => renderMistakes());
    document.getElementById('searchInput').addEventListener('input', () => renderMistakes());
}

// Image Preview & Paste Support
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');

function handleFile(file) {
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (re) => {
            imagePreview.src = re.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        imageInput.files = dataTransfer.files;
    }
}

imageInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
});

window.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            handleFile(blob);
            break;
        }
    }
});

// Add Mistake
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const formData = new FormData(e.target);
    try {
        const res = await fetch('/api/mistakes', { method: 'POST', body: formData });
        if (res.ok) {
            playClickSound();
            e.target.reset();
            document.getElementById('imagePreview').style.display = 'none';
            closeWindow('add');
            openWindow('dashboard');
            loadMistakes();
        } else {
            alert('Error saving');
        }
    } catch (err) {
        alert('Connection error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save to Database';
    }
});

// Load & Render Mistakes
async function loadMistakes() {
    const container = document.getElementById('mistakesList');
    container.innerHTML = '<div class="empty-state">Loading...</div>';
    
    try {
        const res = await fetch('/api/mistakes');
        currentMistakes = await res.json();
        renderMistakes();
    } catch (err) {
        container.innerHTML = '<div class="empty-state">Failed to load mistakes.</div>';
    }
}

function renderMistakes() {
    const container = document.getElementById('mistakesList');
    const filterSubject = document.getElementById('subjectFilter').value;
    const filterDifficulty = document.getElementById('difficultyFilter').value;
    const sortType = document.getElementById('sortFilter').value;
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    
    let filtered = [...currentMistakes];
    
    if (filterSubject) {
        filtered = filtered.filter(m => m.subject === filterSubject);
    }
    if (currentTabTopic !== 'All') {
        filtered = filtered.filter(m => m.topic && m.topic.includes(currentTabTopic));
    }
    if (filterDifficulty) {
        filtered = filtered.filter(m => m.difficulty === filterDifficulty);
    }
    if (searchQuery) {
        filtered = filtered.filter(m => 
            (m.topic && m.topic.toLowerCase().includes(searchQuery)) ||
            (m.mistake && m.mistake.toLowerCase().includes(searchQuery)) ||
            (m.actionable_fix && m.actionable_fix.toLowerCase().includes(searchQuery))
        );
    }

    if (sortType === 'newest') {
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (sortType === 'oldest') {
        filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📝</span>
                <p>No mistakes found. Time to study!</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map((m, index) => `
        <div class="mistake-card" id="mistake-${m.id}" style="animation-delay: ${index * 0.05}s">
            <div class="window-header">
                <div class="window-title">
                    <img src="/static/icon-192.png" class="window-icon">
                    <span>${m.topic || 'Uncategorized'}.exe</span>
                </div>
                <div class="window-controls">
                    <button class="win-btn close" onclick="deleteMistake(${m.id})">X</button>
                </div>
            </div>
            <img src="/${m.image_path}" class="mistake-img" onclick="zoomImage('/${m.image_path}')">
            <div class="card-content">
                <div class="tag-row">
                    <span class="tag tag-subject">${m.subject || 'No Subject'}</span>
                    <span class="tag tag-difficulty difficulty-${m.difficulty || 'None'}">${m.difficulty || '?'}</span>
                </div>
                <div style="font-size: 0.85rem; margin-top: 5px;">${m.mistake || ''}</div>
                ${m.actionable_fix ? `<div class="mistake-fix"><strong>Fix:</strong> ${m.actionable_fix}</div>` : ''}
                ${m.ai_solution ? `<button style="margin-top: 10px; width: 100%; text-align: left;" onclick="showSolution(${m.id})">ℹ️ AI Solution</button>` : ''}
                
                <div class="card-actions">
                    <button class="action-btn edit" onclick="startEdit(${m.id})">Edit</button>
                </div>
            </div>
        </div>
    `).join('');
}

function zoomImage(src) {
    playClickSound();
    document.getElementById('modalImg').src = src;
    document.getElementById('imageModal').style.display = 'flex';
}

function showSolution(id) {
    playClickSound();
    const m = currentMistakes.find(x => x.id === id);
    if (m && m.ai_solution) {
        document.getElementById('solutionOriginalImg').src = '/' + m.image_path;
        const solText = document.getElementById('solutionText');
        try {
            let parsedHTML = marked.parse(m.ai_solution);
            solText.innerHTML = parsedHTML;
            Array.from(solText.children).forEach((child, idx) => {
                child.style.animationDelay = `${idx * 0.1}s`;
            });
        } catch (e) {
            console.error("Markdown parse error:", e);
            solText.textContent = m.ai_solution;
        }
        document.getElementById('solutionModal').style.display = 'flex';
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([solText]).catch(err => console.error(err));
        }
    }
}

// Delete Mistake
async function deleteMistake(id) {
    playClickSound();
    if (!confirm('Are you sure you want to delete this?')) return;
    try {
        const res = await fetch(`/api/mistakes/${id}`, { method: 'DELETE' });
        if (res.ok) {
            currentMistakes = currentMistakes.filter(m => m.id !== id);
            renderMistakes();
        }
    } catch (err) {
        alert('Delete failed');
    }
}

// Edit Mistake
function startEdit(id) {
    playClickSound();
    const m = currentMistakes.find(x => x.id === id);
    if (!m) return;
    document.getElementById('editId').value = m.id;
    document.getElementById('editSubject').value = m.subject;
    updateTopics(m.subject, 'editTopic', m.topic);
    document.getElementById('editDifficulty').value = m.difficulty;
    document.getElementById('editMistake').value = m.mistake;
    document.getElementById('editFix').value = m.actionable_fix;
    openWindow('edit');
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const data = {
        subject: document.getElementById('editSubject').value,
        topic: document.getElementById('editTopic').value,
        difficulty: document.getElementById('editDifficulty').value,
        mistake: document.getElementById('editMistake').value,
        actionable_fix: document.getElementById('editFix').value
    };
    try {
        const res = await fetch(`/api/mistakes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            playClickSound();
            closeWindow('edit');
            loadMistakes();
        } else {
            alert('Update failed');
        }
    } catch (err) {
        alert('Connection error');
    }
});

init();
