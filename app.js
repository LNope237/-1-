const STORAGE_KEY = 'history-notes-v2-data';

const COLORS = [
    '#E85F6E', // coral
    '#F0A050', // amber
    '#3FB7A1', // jade
    '#4F75D8', // azure
    '#8C5BC9', // violet
    '#D86BAE', // rose
    '#E5B83C', // mustard
    '#2DA7C9'  // teal
];

let state = {
    page: 'notes',
    collections: [],
    notes: [],
    activeFilter: 'all', // 'all' | 'uncollected' | collectionId
    editingNoteId: null,
    editingCollectionId: null,
    formCollectionId: null
};

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            state.collections = data.collections || [];
            state.notes = data.notes || [];
        }
    } catch (e) {
        console.warn('读取本地数据失败', e);
    }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            collections: state.collections,
            notes: state.notes
        }));
    } catch (e) {
        console.warn('保存本地数据失败', e);
    }
}

// Export current data as a downloadable JSON file
function exportData() {
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        collections: state.collections,
        notes: state.notes
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `history-notes-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已导出 ' + state.notes.length + ' 条笔记');
}

// Import data from a user-selected JSON file
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
        document.body.removeChild(input);
    };

    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        cleanup();
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const text = ev.target.result;
                const parsed = JSON.parse(text);
                const collections = Array.isArray(parsed.collections) ? parsed.collections : null;
                const notes = Array.isArray(parsed.notes) ? parsed.notes : null;
                if (!collections || !notes) {
                    alert('文件格式不正确：缺少 collections 或 notes 字段');
                    return;
                }
                const ok = confirm(`即将导入 ${collections.length} 个合集、${notes.length} 条笔记。这将覆盖当前数据，是否继续？`);
                if (!ok) return;
                state.collections = collections;
                state.notes = notes;
                saveData();
                render();
                showToast('导入成功');
            } catch (err) {
                alert('导入失败：' + err.message);
            }
        };
        reader.onerror = () => {
            alert('文件读取失败');
            cleanup();
        };
        reader.readAsText(file);
    });

    input.click();
}

// Lightweight toast notification
function showToast(message) {
    let toast = document.getElementById('appToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        toast.className = 'app-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2200);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Truncate long text for the home-page preview (max 50 chars by default).
// Returns the escaped string with an ellipsis if truncated.
function truncatePreview(text, max = 50) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    if (str.length <= max) return escapeHtml(str);
    return escapeHtml(str.slice(0, max)) + '…';
}

function getCollection(id) {
    if (!id) return null;
    return state.collections.find(c => c.id === id) || null;
}

function getNotesInCurrentFilter() {
    let notes = state.notes.slice();
    if (state.activeFilter === 'all') {
        return notes;
    } else if (state.activeFilter === 'uncollected') {
        return notes.filter(n => !n.collectionId);
    } else {
        return notes.filter(n => n.collectionId === state.activeFilter);
    }
}

function sortNotes(notes) {
    return notes.slice().sort((a, b) => {
        const ka = (a.dateKey || a.time || '').toString();
        const kb = (b.dateKey || b.time || '').toString();
        if (ka !== kb) return ka.localeCompare(kb, 'zh-Hans-CN', { numeric: true });
        return (a.createdAt || 0) - (b.createdAt || 0);
    });
}

function groupByTime(notes) {
    const sorted = sortNotes(notes);
    const map = new Map();
    sorted.forEach(note => {
        const key = note.time || '未命名时间';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(note);
    });
    return Array.from(map.entries());
}

function countNotesByCollection() {
    const map = {};
    state.collections.forEach(c => { map[c.id] = 0; });
    state.notes.forEach(n => {
        if (n.collectionId && map[n.collectionId] !== undefined) {
            map[n.collectionId]++;
        }
    });
    return map;
}

function countUncollected() {
    return state.notes.filter(n => !n.collectionId).length;
}

// Router — uses HTML5 history so the browser back button returns to the
// previous page of the app instead of leaving the app.
function buildUrlFromState() {
    const params = new URLSearchParams();
    params.set('page', state.page);
    if (state.activeFilter) params.set('filter', state.activeFilter);
    if (state.editingNoteId) params.set('noteId', state.editingNoteId);
    if (state.editingCollectionId) params.set('collectionId', state.editingCollectionId);
    return '?' + params.toString();
}

function applyStateFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page') || 'notes';
    state.page = page;
    state.activeFilter = params.get('filter') || 'all';
    state.editingNoteId = params.get('noteId') || null;
    state.editingCollectionId = params.get('collectionId') || null;
}

function navigateTo(page, params = {}) {
    state.page = page;
    if (params.noteId !== undefined) state.editingNoteId = params.noteId;
    if (params.collectionId !== undefined) state.editingCollectionId = params.collectionId;
    if (params.formCollectionId !== undefined) state.formCollectionId = params.formCollectionId;
    if (params.filter !== undefined) state.activeFilter = params.filter;

    // Push the new URL so browser back/forward buttons navigate within the app.
    const url = buildUrlFromState();
    if (window.location.search !== url) {
        history.pushState({ app: true }, '', url);
    }
    render();
}

function render() {
    const main = $('#appMain');
    const tabs = $$('.nav-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.page === state.page);
    });

    switch (state.page) {
        case 'notes':
            main.innerHTML = renderNotesPage();
            bindNotesPage();
            break;
        case 'collections':
            main.innerHTML = renderCollectionsPage();
            bindCollectionsPage();
            break;
        case 'note-form':
            main.innerHTML = renderNoteFormPage();
            bindNoteFormPage();
            break;
        case 'collection-form':
            main.innerHTML = renderCollectionFormPage();
            bindCollectionFormPage();
            break;
    }
}

function renderNotesPage() {
    const notes = getNotesInCurrentFilter();
    const grouped = groupByTime(notes);
    const counts = countNotesByCollection();
    const uncollectedCount = countUncollected();
    const totalCount = state.notes.length;

    let filterLabel = '全部笔记';
    if (state.activeFilter === 'uncollected') filterLabel = '未加入合集';
    else if (state.activeFilter !== 'all') {
        const c = getCollection(state.activeFilter);
        if (c) filterLabel = c.name;
    }

    return `
        <div class="page-with-sidebar">
            <aside class="sidebar">
                <div class="sidebar-title">合集</div>
                <div class="collection-item ${state.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
                    <span class="collection-dot" style="background:var(--text-muted)"></span>
                    <span class="collection-name">全部笔记</span>
                    <span class="collection-count">${totalCount}</span>
                </div>
                <div class="collection-item ${state.activeFilter === 'uncollected' ? 'active' : ''}" data-filter="uncollected">
                    <span class="collection-dot" style="background:var(--pop-amber)"></span>
                    <span class="collection-name">未加入合集</span>
                    <span class="collection-count">${uncollectedCount}</span>
                </div>
                <div class="sidebar-divider"></div>
                <div class="sidebar-title">我的合集</div>
                ${state.collections.length === 0 ? `
                    <div style="font-size:12px;color:var(--text-muted);padding:8px 12px">暂无合集</div>
                ` : state.collections.map(c => `
                    <div class="collection-item ${state.activeFilter === c.id ? 'active' : ''}" data-filter="${c.id}">
                        <span class="collection-dot" style="background:${c.color}"></span>
                        <span class="collection-name">${escapeHtml(c.name)}</span>
                        <span class="collection-count">${counts[c.id] || 0}</span>
                    </div>
                `).join('')}
                <button class="btn btn-secondary btn-sidebar" id="btnNewCollection" style="margin-top:12px">+ 新建合集</button>
            </aside>

            <div class="main-panel">
                <div class="panel-header">
                    <div>
                        <h2 class="panel-title">${escapeHtml(filterLabel)}</h2>
                        <p class="panel-subtitle">${notes.length} 条笔记 · 按时间顺序排列</p>
                    </div>
                    <div class="panel-actions">
                        <button class="btn btn-primary" id="btnNewNote">+ 新建笔记</button>
                    </div>
                </div>

                ${grouped.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">◌</div>
                        <h3>${state.notes.length === 0 ? '还没有笔记' : '此分类下暂无笔记'}</h3>
                        <p>点击「新建笔记」开始记录你的史料阅读心得。</p>
                    </div>
                ` : renderNotesTable(grouped)}
            </div>
        </div>
    `;
}

function renderNotesTable(grouped) {
    return `
        <div class="notes-table">
            <div class="notes-table-header">
                <div>时间</div>
                <div>事件</div>
                <div>感受</div>
            </div>
            <div class="notes-table-body">
                ${grouped.map(([time, items]) => {
                    const hasBracket = items.length > 1;
                    const firstNoteCollection = items[0] ? getCollection(items[0].collectionId) : null;
                    return `
                        <div class="time-group ${hasBracket ? 'has-bracket' : ''}">
                            ${hasBracket ? `
                                <svg class="time-group-bracket" viewBox="0 0 18 100" preserveAspectRatio="none" aria-hidden="true">
                                    <path d="M 14 0 C 4 0 4 30 4 50 C 4 70 4 100 14 100" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                                </svg>
                            ` : ''}
                            ${items.map((note, idx) => {
                                const isFirstRow = idx === 0;
                                const showLabel = isFirstRow && firstNoteCollection;
                                return `
                                    <div class="time-cell ${isFirstRow ? '' : 'time-cell-empty'}">
                                        ${showLabel ? `<span class="time-cell-label" style="background:${firstNoteCollection.color}">${escapeHtml(firstNoteCollection.name)}</span>` : ''}
                                        ${isFirstRow ? `<span class="time-cell-text">${escapeHtml(time)}</span>` : ''}
                                    </div>
                                    <div class="event-cell">${truncatePreview(note.event)}<div class="note-row-actions">
                                            <button class="btn btn-ghost btn-sm" data-action="edit-note" data-id="${note.id}">编辑</button>
                                            <button class="btn btn-ghost btn-sm" data-action="delete-note" data-id="${note.id}" style="color:var(--pop-coral)">删除</button>
                                        </div>
                                    </div>
                                    <div class="feeling-cell">${truncatePreview(note.feeling)}</div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderCollectionsPage() {
    return `
        <div class="panel-header">
            <div>
                <h2 class="panel-title">合集管理</h2>
                <p class="panel-subtitle">将相关的读书笔记组织到合集中。</p>
            </div>
            <div class="panel-actions">
                <button class="btn btn-primary" id="btnNewCollection2">+ 新建合集</button>
            </div>
        </div>

        ${state.collections.length === 0 ? `
            <div class="empty-state">
                <div class="empty-state-icon">◌</div>
                <h3>还没有合集</h3>
                <p>合集可以将同一个主题下的笔记聚合在一起。</p>
            </div>
        ` : `
            <div class="collection-grid">
                ${state.collections.map(c => {
                    const noteCount = state.notes.filter(n => n.collectionId === c.id).length;
                    return `
                        <div class="collection-card" data-id="${c.id}">
                            <div class="collection-card-color" style="background:${c.color}"></div>
                            <h3>${escapeHtml(c.name)}</h3>
                            <p>${escapeHtml(c.description || '暂无描述')}</p>
                            <div class="collection-card-footer">
                                <span>${noteCount} 条笔记</span>
                                <div class="collection-card-actions">
                                    <button data-action="edit-collection" data-id="${c.id}">编辑</button>
                                    <button data-action="delete-collection" data-id="${c.id}" style="color:var(--pop-coral)">删除</button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `}
    `;
}

function renderNoteFormPage() {
    const isEdit = !!state.editingNoteId;
    const note = isEdit ? state.notes.find(n => n.id === state.editingNoteId) : null;
    const collections = state.collections;

    return `
        <div class="panel-header">
            <div>
                <h2 class="panel-title">${isEdit ? '编辑笔记' : '新建笔记'}</h2>
                <p class="panel-subtitle">从时间、事件、感受三个维度记录。</p>
            </div>
            <div class="panel-actions">
                <button class="btn btn-secondary" id="btnCancel">取消</button>
            </div>
        </div>

        <div class="form-card">
            <form id="noteForm">
                <div class="form-row">
                    <div class="form-group">
                        <label for="noteTime">时间 <span style="color:var(--text-muted);font-weight:400">（显示用，如"万历十五年"）</span></label>
                        <input type="text" id="noteTime" class="form-control" placeholder="万历十五年" value="${isEdit ? escapeHtml(note.time || '') : ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="noteDateKey">排序键 <span style="color:var(--text-muted);font-weight:400">（决定时间顺序，可留空使用时间字段）</span></label>
                        <input type="text" id="noteDateKey" class="form-control" placeholder="如：1587 或 1587-01" value="${isEdit ? escapeHtml(note.dateKey || '') : ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label for="noteEvent">事件</label>
                    <textarea id="noteEvent" class="form-control" placeholder="这一时间点发生的关键事件……" required>${isEdit ? escapeHtml(note.event || '') : ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="noteFeeling">感受</label>
                    <textarea id="noteFeeling" class="form-control" placeholder="你的思考、联想、疑问或感悟……" required>${isEdit ? escapeHtml(note.feeling || '') : ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="noteCollection">所属合集 <span style="color:var(--text-muted);font-weight:400">（可加入或保持"未归集"）</span></label>
                    <select id="noteCollection" class="form-control">
                        <option value="">未归集</option>
                        ${collections.map(c => `
                            <option value="${c.id}" ${(isEdit && note.collectionId === c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">${isEdit ? '保存修改' : '创建笔记'}</button>
                </div>
            </form>
        </div>
    `;
}

function renderCollectionFormPage() {
    const isEdit = !!state.editingCollectionId;
    const collection = isEdit ? state.collections.find(c => c.id === state.editingCollectionId) : null;
    let selectedColor = isEdit ? collection.color : COLORS[0];

    return `
        <div class="panel-header">
            <div>
                <h2 class="panel-title">${isEdit ? '编辑合集' : '新建合集'}</h2>
                <p class="panel-subtitle">用合集组织主题相关的读书笔记。</p>
            </div>
            <div class="panel-actions">
                <button class="btn btn-secondary" id="btnCancel">取消</button>
            </div>
        </div>

        <div class="form-card">
            <form id="collectionForm">
                <div class="form-group">
                    <label for="collectionName">合集名称</label>
                    <input type="text" id="collectionName" class="form-control" placeholder="如：明朝中后期、明清易代" value="${isEdit ? escapeHtml(collection.name || '') : ''}" required>
                </div>
                <div class="form-group">
                    <label for="collectionDesc">合集描述（可选）</label>
                    <textarea id="collectionDesc" class="form-control" placeholder="这个合集涵盖的主题……">${isEdit ? escapeHtml(collection.description || '') : ''}</textarea>
                </div>
                <div class="form-group">
                    <label>主题色</label>
                    <div class="color-picker" id="colorPicker">
                        ${COLORS.map(color => `
                            <div class="color-option ${color === selectedColor ? 'selected' : ''}" data-color="${color}" style="background:${color}"></div>
                        `).join('')}
                    </div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">${isEdit ? '保存修改' : '创建合集'}</button>
                </div>
            </form>
        </div>
    `;
}

// Bindings
function bindNotesPage() {
    $$('.collection-item').forEach(item => {
        item.addEventListener('click', () => {
            navigateTo('notes', { filter: item.dataset.filter });
        });
    });

    const newBtn = $('#btnNewNote');
    if (newBtn) newBtn.addEventListener('click', () => navigateTo('note-form', { noteId: null }));

    const newColBtn = $('#btnNewCollection');
    if (newColBtn) newColBtn.addEventListener('click', () => navigateTo('collection-form', { collectionId: null }));

    $$('[data-action="edit-note"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateTo('note-form', { noteId: btn.dataset.id });
        });
    });

    $$('[data-action="delete-note"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('确定要删除这条笔记吗？')) {
                state.notes = state.notes.filter(n => n.id !== btn.dataset.id);
                saveData();
                render();
            }
        });
    });
}

function bindCollectionsPage() {
    const newBtn = $('#btnNewCollection2');
    if (newBtn) newBtn.addEventListener('click', () => navigateTo('collection-form', { collectionId: null }));

    $$('.collection-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-action]')) return;
            navigateTo('notes', { filter: card.dataset.id });
        });
    });

    $$('[data-action="edit-collection"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateTo('collection-form', { collectionId: btn.dataset.id });
        });
    });

    $$('[data-action="delete-collection"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const colId = btn.dataset.id;
            const col = state.collections.find(c => c.id === colId);
            const noteCount = state.notes.filter(n => n.collectionId === colId).length;
            const msg = noteCount > 0
                ? `确定要删除合集「${col ? col.name : ''}」吗？\n该合集下的 ${noteCount} 条笔记将变为"未归集"状态。`
                : `确定要删除合集「${col ? col.name : ''}」吗？`;
            if (confirm(msg)) {
                state.collections = state.collections.filter(c => c.id !== colId);
                state.notes.forEach(n => {
                    if (n.collectionId === colId) n.collectionId = null;
                });
                if (state.activeFilter === colId) state.activeFilter = 'all';
                saveData();
                render();
            }
        });
    });
}

function bindNoteFormPage() {
    const cancel = $('#btnCancel');
    if (cancel) cancel.addEventListener('click', () => navigateTo('notes'));

    $('#noteForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const time = $('#noteTime').value.trim();
        const dateKey = $('#noteDateKey').value.trim();
        const eventText = $('#noteEvent').value.trim();
        const feeling = $('#noteFeeling').value.trim();
        const collectionId = $('#noteCollection').value || null;

        if (!time || !eventText || !feeling) return;

        const data = {
            time,
            dateKey: dateKey || time,
            event: eventText,
            feeling,
            collectionId,
            updatedAt: Date.now()
        };

        if (state.editingNoteId) {
            const note = state.notes.find(n => n.id === state.editingNoteId);
            if (note) Object.assign(note, data);
        } else {
            state.notes.push({
                id: generateId(),
                ...data,
                createdAt: Date.now()
            });
        }

        saveData();
        navigateTo('notes');
    });
}

function bindCollectionFormPage() {
    const cancel = $('#btnCancel');
    if (cancel) cancel.addEventListener('click', () => navigateTo('collections'));

    let selectedColor = COLORS[0];
    if (state.editingCollectionId) {
        const col = state.collections.find(c => c.id === state.editingCollectionId);
        if (col) selectedColor = col.color;
    }

    const colorOptions = $$('.color-option');
    function updateSelected() {
        colorOptions.forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.color === selectedColor);
        });
    }

    colorOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            selectedColor = opt.dataset.color;
            updateSelected();
        });
    });

    $('#collectionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#collectionName').value.trim();
        const description = $('#collectionDesc').value.trim();
        if (!name) return;

        if (state.editingCollectionId) {
            const col = state.collections.find(c => c.id === state.editingCollectionId);
            if (col) {
                col.name = name;
                col.description = description;
                col.color = selectedColor;
            }
        } else {
            state.collections.push({
                id: generateId(),
                name,
                description,
                color: selectedColor,
                createdAt: Date.now()
            });
        }

        saveData();
        navigateTo('collections');
    });
}

// DOM helpers
function $(selector, context = document) {
    return context.querySelector(selector);
}

function $$ (selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

// Init
function init() {
    loadData();
    seedDemoDataIfEmpty();

    $$('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            state.editingNoteId = null;
            state.editingCollectionId = null;
            navigateTo(tab.dataset.page);
        });
    });

    // Sync controls (live in header so they work on every page)
    const exportBtn = $('#btnExport');
    if (exportBtn) exportBtn.addEventListener('click', exportData);

    const importBtn = $('#btnImport');
    if (importBtn) importBtn.addEventListener('click', importData);

    // Cross-tab sync: when another tab writes to localStorage,
    // re-read and re-render so this tab reflects the latest data.
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                state.collections = data.collections || [];
                state.notes = data.notes || [];
                render();
            } catch (err) {
                console.warn('storage 事件处理失败', err);
            }
        }
    });

    // Restore state from the URL on first load so deep links work.
    applyStateFromLocation();

    // Make sure the initial URL is registered with the browser history so the
    // very first back-button press returns to it rather than leaving the app.
    if (!window.location.search) {
        history.replaceState({ app: true }, '', buildUrlFromState());
    }

    // Browser back/forward navigates within the app.
    window.addEventListener('popstate', () => {
        applyStateFromLocation();
        render();
    });

    render();
}

function seedDemoDataIfEmpty() {
    if (state.notes.length > 0 || state.collections.length > 0) return;

    const colId1 = generateId();
    const colId2 = generateId();

    state.collections = [
        { id: colId1, name: '明史拾遗', description: '关于明代政治、人物与制度的阅读摘录。', color: '#E85F6E', createdAt: Date.now() - 5000 },
        { id: colId2, name: '史记漫读', description: '《史记》中的关键事件与人物。', color: '#8C5BC9', createdAt: Date.now() - 4000 }
    ];

    // Intentionally long text so the preview truncation is visible.
    state.notes = [
        { id: generateId(), time: '万历十五年', dateKey: '1587', event: '张居正去世后，改革逐渐废弛，朝廷财政吃紧，边防松弛，各地豪强兼并土地日趋严重。', feeling: '改革之难，在于人亡政息。一人之志，难敌整个官僚系统的惰性与既得利益者的反扑。', collectionId: colId1, createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000 },
        { id: generateId(), time: '万历十五年', dateKey: '1587', event: '海瑞上疏痛陈时弊，言辞激烈震动朝野，却被指为狂悖。', feeling: '清官难做，是因为制度本身不让人做清官。', collectionId: colId1, createdAt: Date.now() - 900, updatedAt: Date.now() - 900 },
        { id: generateId(), time: '万历十五年', dateKey: '1587', event: '戚继光在蓟镇练兵，整顿边军。', feeling: '名将之功，常被朝廷牵制而消耗。', collectionId: colId1, createdAt: Date.now() - 800, updatedAt: Date.now() - 800 },
        { id: generateId(), time: '公元前 202 年', dateKey: '-202', event: '垓下之战，项羽乌江自刎，四年楚汉相争终于落下帷幕。', feeling: '英雄末路，最是动人心魄。可胜不可败，败则身死国灭。', collectionId: colId2, createdAt: Date.now() - 700, updatedAt: Date.now() - 700 },
        { id: generateId(), time: '公元前 202 年', dateKey: '-202', event: '刘邦称帝，建立汉朝，定都长安。', feeling: '得天下与治天下，是两件截然不同的事。', collectionId: colId2, createdAt: Date.now() - 600, updatedAt: Date.now() - 600 },
        { id: generateId(), time: '贞观之治', dateKey: '0630', event: '唐太宗纳谏，推行均田制与租庸调制，轻徭薄赋，与民生息。', feeling: '一个时代的好坏，常常取决于君主能否克制自己、倾听不同意见。', collectionId: null, createdAt: Date.now() - 500, updatedAt: Date.now() - 500 }
    ];

    saveData();
}

init();
