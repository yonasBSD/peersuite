let kanbanData = { columns: [] };
let draggedCardElement = null;
let draggedCardData = null;
let kanbanCurrentlyAddingCardToColumnId = null;

let sendKanbanUpdateDep, sendInitialKanbanDep;
let logStatusDep, showNotificationDep;
let getPeerNicknamesDep;

let kanbanBoard, newColumnNameInput, addColumnBtn;

function selectKanbanDomElements() {
    kanbanBoard = document.getElementById('kanbanBoard');
    newColumnNameInput = document.getElementById('newColumnNameInput');
    addColumnBtn = document.getElementById('addColumnBtn');
}

// Helper for generating UUIDs
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function initKanbanFeatures(dependencies) {
    selectKanbanDomElements();

    sendKanbanUpdateDep = dependencies.sendKanbanUpdate;
    sendInitialKanbanDep = dependencies.sendInitialKanban;
    logStatusDep = dependencies.logStatus;
    showNotificationDep = dependencies.showNotification;
    getPeerNicknamesDep = dependencies.getPeerNicknames;

    if (!addColumnBtn || !kanbanBoard || !newColumnNameInput) {
        console.warn("Kanban DOM elements not found, Kanban feature might be partially disabled.");
    } else {
        addColumnBtn.addEventListener('click', handleAddKanbanColumn);
    }
    
    renderKanbanBoard();

    return {
        handleKanbanUpdate,
        handleInitialKanban,
        renderKanbanBoardIfActive,
        getKanbanData,
        loadKanbanData,
        resetKanbanState,
        sendInitialKanbanStateToPeer
    };
}

// SECURITY NOTE: using document.createElement prevents XSS
export function renderKanbanBoard() {
    if (!kanbanBoard) return;
    kanbanBoard.innerHTML = '';
    if (!kanbanData || !kanbanData.columns) kanbanData = { columns: [] };

    kanbanData.columns.forEach(column => {
        const columnDiv = document.createElement('div');
        columnDiv.classList.add('kanban-column');
        columnDiv.dataset.columnId = column.id;

        const header = document.createElement('h3');
        header.textContent = column.title;
        
        const deleteColBtn = document.createElement('button');
        deleteColBtn.classList.add('delete-column-btn');
        deleteColBtn.dataset.columnId = column.id;
        deleteColBtn.title = "Delete column";
        deleteColBtn.textContent = "🗑️";
        deleteColBtn.addEventListener('click', () => handleDeleteKanbanColumn(column.id));
        header.appendChild(deleteColBtn);
        
        columnDiv.appendChild(header);

        const cardsContainer = document.createElement('div');
        cardsContainer.classList.add('kanban-cards');

        (column.cards || []).forEach(card => {
            const cardPriority = card.priority || 1;
            
            const cardDiv = document.createElement('div');
            cardDiv.classList.add('kanban-card', `priority-${cardPriority}`);
            cardDiv.draggable = true;
            cardDiv.dataset.cardId = card.id;
            cardDiv.dataset.parentColumnId = column.id;
            cardDiv.dataset.priority = cardPriority;

            const contentDiv = document.createElement('div');
            contentDiv.classList.add('kanban-card-content');

            const p = document.createElement('p');
            p.textContent = card.text; 
            contentDiv.appendChild(p);

            const prioritySelect = document.createElement('select');
            prioritySelect.classList.add('kanban-card-priority');
            prioritySelect.dataset.cardId = card.id;
            prioritySelect.dataset.columnId = column.id;
            
            const priorities = [
                { val: 1, label: 'Low' },
                { val: 2, label: 'Medium' },
                { val: 3, label: 'High' },
                { val: 4, label: 'Critical' }
            ];

            priorities.forEach(prio => {
                const option = document.createElement('option');
                option.value = prio.val;
                option.textContent = prio.label;
                if (cardPriority == prio.val) option.selected = true;
                prioritySelect.appendChild(option);
            });

            prioritySelect.addEventListener('change', (e) => handleUpdateCardPriority(column.id, card.id, e.target.value));
            contentDiv.appendChild(prioritySelect);
            cardDiv.appendChild(contentDiv);

            const deleteCardBtn = document.createElement('button');
            deleteCardBtn.classList.add('delete-card-btn');
            deleteCardBtn.dataset.cardId = card.id;
            deleteCardBtn.dataset.columnId = column.id;
            deleteCardBtn.title = "Delete card";
            deleteCardBtn.textContent = "❌";
            deleteCardBtn.addEventListener('click', () => handleDeleteKanbanCard(column.id, card.id));
            cardDiv.appendChild(deleteCardBtn);

            cardDiv.addEventListener('dragstart', handleKanbanDragStart);
            cardDiv.addEventListener('dragend', handleKanbanDragEnd);

            cardsContainer.appendChild(cardDiv);
        });

        columnDiv.appendChild(cardsContainer);

        if (column.id === kanbanCurrentlyAddingCardToColumnId) {
            const formDiv = document.createElement('div');
            formDiv.classList.add('add-card-form');

            const textarea = document.createElement('textarea');
            textarea.classList.add('new-card-text-input');
            textarea.placeholder = "Enter card text...";
            formDiv.appendChild(textarea);

            const actionsDiv = document.createElement('div');
            actionsDiv.classList.add('add-card-form-actions');

            const saveBtn = document.createElement('button');
            saveBtn.classList.add('save-new-card-btn');
            saveBtn.dataset.columnId = column.id;
            saveBtn.textContent = "Save Card";
            saveBtn.addEventListener('click', () => handleSaveNewCard(column.id));
            
            const cancelBtn = document.createElement('button');
            cancelBtn.classList.add('cancel-add-card-btn');
            cancelBtn.dataset.columnId = column.id;
            cancelBtn.textContent = "Cancel";
            cancelBtn.addEventListener('click', handleCancelAddCard);

            actionsDiv.appendChild(saveBtn);
            actionsDiv.appendChild(cancelBtn);
            formDiv.appendChild(actionsDiv);
            columnDiv.appendChild(formDiv);

            setTimeout(() => textarea.focus(), 0);
        } else {
            const addCardBtn = document.createElement('button');
            addCardBtn.classList.add('add-card-btn');
            addCardBtn.dataset.columnId = column.id;
            addCardBtn.textContent = "+ Add Card";
            addCardBtn.addEventListener('click', () => handleShowAddCardForm(column.id));
            columnDiv.appendChild(addCardBtn);
        }

        columnDiv.addEventListener('dragover', handleKanbanDragOver);
        columnDiv.addEventListener('dragleave', handleKanbanDragLeave);
        columnDiv.addEventListener('drop', handleKanbanDrop);

        kanbanBoard.appendChild(columnDiv);
    });
}

export function renderKanbanBoardIfActive(force = false) {
    const kanbanSectionEl = document.getElementById('kanbanSection');
    if (kanbanBoard && ( (kanbanSectionEl && !kanbanSectionEl.classList.contains('hidden')) || force)) {
        renderKanbanBoard();
    }
}

function handleKanbanDragStart(e) {
    draggedCardElement = e.target;
    const cardPriority = e.target.dataset.priority || 1;
    const textP = e.target.querySelector('.kanban-card-content p');
    draggedCardData = {
        id: e.target.dataset.cardId,
        originalColumnId: e.target.dataset.parentColumnId,
        text: textP ? textP.textContent : '',
        priority: parseInt(cardPriority)
    };
    e.dataTransfer.setData('text/plain', e.target.dataset.cardId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if(draggedCardElement) draggedCardElement.classList.add('dragging'); }, 0);
}

function handleKanbanDragEnd(e) {
    if(draggedCardElement) draggedCardElement.classList.remove('dragging');
    draggedCardElement = null; draggedCardData = null;
    if(kanbanBoard) kanbanBoard.querySelectorAll('.kanban-column.drag-over').forEach(col => col.classList.remove('drag-over'));
}

function handleKanbanDragOver(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const column = e.target.closest('.kanban-column');
    if (column && kanbanBoard) {
        kanbanBoard.querySelectorAll('.kanban-column.drag-over').forEach(col => col.classList.remove('drag-over'));
        column.classList.add('drag-over');
    }
}

function handleKanbanDragLeave(e) {
    const column = e.target.closest('.kanban-column');
    if (column && !column.contains(e.relatedTarget)) column.classList.remove('drag-over');
}

function handleKanbanDrop(e) {
    e.preventDefault(); if (!draggedCardData) return;
    const targetColumnDiv = e.target.closest('.kanban-column');
    if (!targetColumnDiv) return;
    targetColumnDiv.classList.remove('drag-over');
    const targetColumnId = targetColumnDiv.dataset.columnId;

    if (draggedCardData.originalColumnId !== targetColumnId) {
        const sourceCol = kanbanData.columns.find(c => c.id === draggedCardData.originalColumnId);
        const targetCol = kanbanData.columns.find(c => c.id === targetColumnId);
        if (sourceCol && targetCol) {
            if (!sourceCol.cards) sourceCol.cards = [];
            const cardIndex = sourceCol.cards.findIndex(card => card.id === draggedCardData.id);
            if (cardIndex > -1) {
                const [movedCard] = sourceCol.cards.splice(cardIndex, 1);
                if (!targetCol.cards) targetCol.cards = [];
                targetCol.cards.push(movedCard); 
                const update = { type: 'moveCard', cardId: draggedCardData.id, fromColumnId: draggedCardData.originalColumnId, toColumnId: targetColumnId, cardData: movedCard };
                if (sendKanbanUpdateDep) sendKanbanUpdateDep(update);
                renderKanbanBoard();
                if (getPeerNicknamesDep && Object.keys(getPeerNicknamesDep()).length > 0 && showNotificationDep) showNotificationDep('kanbanSection');
            }
        }
    }
    draggedCardElement = null; draggedCardData = null;
}

function handleAddKanbanColumn() {
    if(!newColumnNameInput) return;
    const columnName = newColumnNameInput.value.trim(); if (!columnName) return;
    // UUID for Column
    const newColumn = { id: generateUUID(), title: columnName, cards: [] };
    if (!kanbanData.columns) kanbanData.columns = [];
    kanbanData.columns.push(newColumn);
    if (sendKanbanUpdateDep) sendKanbanUpdateDep({ type: 'addColumn', column: newColumn });
    renderKanbanBoard(); newColumnNameInput.value = '';
    if (getPeerNicknamesDep && Object.keys(getPeerNicknamesDep()).length > 0 && showNotificationDep) showNotificationDep('kanbanSection');
}

function handleShowAddCardForm(columnId) {
    kanbanCurrentlyAddingCardToColumnId = columnId;
    renderKanbanBoard();
}

function handleSaveNewCard(columnId) {
    if (!kanbanBoard) return;
    const columnDiv = kanbanBoard.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
    if (!columnDiv) return;
    const textarea = columnDiv.querySelector('.new-card-text-input');
    if (!textarea) return;

    const cardText = textarea.value.trim();
    if (!cardText) {
        if (logStatusDep) logStatusDep("Card text cannot be empty.", true);
        textarea.focus();
        return;
    }

    const column = kanbanData.columns.find(col => col.id === columnId);
    if (column) {
        // UUID for Card
        const newCard = { 
            id: generateUUID(),
            text: cardText,
            priority: 1
        };
        if (!column.cards) column.cards = [];
        column.cards.push(newCard);
        
        if (sendKanbanUpdateDep) sendKanbanUpdateDep({ type: 'addCard', columnId, card: newCard });
        
        kanbanCurrentlyAddingCardToColumnId = null; 
        renderKanbanBoard(); 
        if (getPeerNicknamesDep && Object.keys(getPeerNicknamesDep()).length > 0 && showNotificationDep) showNotificationDep('kanbanSection');
    }
}

function handleCancelAddCard() {
    kanbanCurrentlyAddingCardToColumnId = null;
    renderKanbanBoard();
}

function handleUpdateCardPriority(columnId, cardId, newPriorityStr) {
    const newPriority = parseInt(newPriorityStr);
    const column = kanbanData.columns.find(c => c.id === columnId);
    if (column && column.cards) {
        const card = column.cards.find(c => c.id === cardId);
        if (card) {
            card.priority = newPriority;
            if (sendKanbanUpdateDep) sendKanbanUpdateDep({ type: 'updateCardPriority', columnId, cardId, priority: newPriority });
            renderKanbanBoard(); 
            if (getPeerNicknamesDep && Object.keys(getPeerNicknamesDep()).length > 0 && showNotificationDep) showNotificationDep('kanbanSection');
        }
    }
}

function handleDeleteKanbanColumn(columnId) {
    if (!confirm("Delete column and all cards?")) return;
    kanbanData.columns = kanbanData.columns.filter(col => col.id !== columnId);
    if (sendKanbanUpdateDep) sendKanbanUpdateDep({ type: 'deleteColumn', columnId });
    renderKanbanBoard();
    if (getPeerNicknamesDep && Object.keys(getPeerNicknamesDep()).length > 0 && showNotificationDep) showNotificationDep('kanbanSection');
}

function handleDeleteKanbanCard(columnId, cardId) {
    if (!confirm("Delete card?")) return;
    const column = kanbanData.columns.find(col => col.id === columnId);
    if (column && column.cards) {
        column.cards = column.cards.filter(card => card.id !== cardId);
        if (sendKanbanUpdateDep) sendKanbanUpdateDep({ type: 'deleteCard', columnId, cardId });
        renderKanbanBoard();
        if (getPeerNicknamesDep && Object.keys(getPeerNicknamesDep()).length > 0 && showNotificationDep) showNotificationDep('kanbanSection');
    }
}

export function handleKanbanUpdate(update, peerId, localGeneratedPeerId) {
    let needsRender = true;
    if (!kanbanData.columns) kanbanData.columns = [];
    switch (update.type) {
        case 'fullState': 
            kanbanData = update.data;
            if (kanbanData && kanbanData.columns) {
                kanbanData.columns.forEach(column => {
                    if (column.cards) {
                        column.cards.forEach(card => card.priority = card.priority || 1);
                    }
                });
            }
            break;
        case 'addColumn': 
            if (!kanbanData.columns.find(c => c.id === update.column.id)) {
                kanbanData.columns.push(update.column);
            } else {
                needsRender = false;
            }
            break;
        case 'addCard': { 
            const col = kanbanData.columns.find(c => c.id === update.columnId); 
            if (col) { 
                if (!col.cards) col.cards = []; 
                const existingCardIndex = col.cards.findIndex(c => c.id === update.card.id);
                const cardData = { ...update.card, priority: update.card.priority || 1 };

                if (existingCardIndex > -1) { 
                    col.cards[existingCardIndex] = { ...col.cards[existingCardIndex], ...cardData };
                } else { 
                    col.cards.push(cardData);
                }
            } else { needsRender = false; } 
            break; 
        }
        case 'deleteColumn': 
            kanbanData.columns = kanbanData.columns.filter(c => c.id !== update.columnId); 
            break;
        case 'deleteCard': { 
            const col = kanbanData.columns.find(c => c.id === update.columnId); 
            if (col && col.cards) {
                col.cards = col.cards.filter(card => card.id !== update.cardId);
            } else {
                needsRender = false;
            }
            break; 
        }
        case 'moveCard': { 
            const sCol = kanbanData.columns.find(c => c.id === update.fromColumnId); 
            const tCol = kanbanData.columns.find(c => c.id === update.toColumnId); 
            if (sCol && tCol) { 
                if(!sCol.cards) sCol.cards =[]; 
                const idx = sCol.cards.findIndex(c => c.id === update.cardId); 
                if (idx > -1) { 
                    const [mCard] = sCol.cards.splice(idx, 1); 
                    const movedCardWithPriority = { ...mCard, ...(update.cardData || {}), priority: (update.cardData?.priority || mCard.priority || 1) };
                    if (!tCol.cards) tCol.cards = []; 
                    tCol.cards.push(movedCardWithPriority); 
                } else { needsRender = false; } 
            } else { needsRender = false; } 
            break; 
        }
        case 'updateCardPriority': {
            const col = kanbanData.columns.find(c => c.id === update.columnId);
            if (col && col.cards) {
                const card = col.cards.find(c => c.id === update.cardId);
                if (card) {
                    card.priority = update.priority;
                } else { needsRender = false; }
            } else { needsRender = false; }
            break;
        }
        default: 
            console.warn("Unknown Kanban update type:", update.type); 
            needsRender = false;
    }
    if (needsRender) {
        renderKanbanBoard();
        if (peerId !== localGeneratedPeerId && showNotificationDep) showNotificationDep('kanbanSection');
    }
}
export function handleInitialKanban(initialData, peerId, getIsHost, localGeneratedPeerId) {
    if (getIsHost && !getIsHost()) {
        kanbanData = initialData;
         if (kanbanData && kanbanData.columns) {
            kanbanData.columns.forEach(column => {
                if (column.cards) {
                    column.cards.forEach(card => card.priority = card.priority || 1);
                }
            });
        }
        renderKanbanBoardIfActive(true);
        if(logStatusDep) logStatusDep(`Received Kanban state from ${(getPeerNicknamesDep && getPeerNicknamesDep()[peerId]) ? getPeerNicknamesDep()[peerId] : 'host'}.`);
    }
}

export function getKanbanData() {
    return kanbanData;
}

export function loadKanbanData(importedData) {
    kanbanData = importedData || { columns: [] };
    if (kanbanData && kanbanData.columns) {
        kanbanData.columns.forEach(column => {
            if (column.cards) {
                column.cards.forEach(card => card.priority = card.priority || 1);
            }
        });
    }
}

export function resetKanbanState() {
    kanbanData = { columns: [] }; 
    kanbanCurrentlyAddingCardToColumnId = null; 
    if (kanbanBoard) kanbanBoard.innerHTML = '';
}

export function sendInitialKanbanStateToPeer(peerId, getIsHost) {
    if (getIsHost && getIsHost() && sendInitialKanbanDep && (kanbanData.columns && kanbanData.columns.length > 0)) {
        sendInitialKanbanDep(kanbanData, peerId);
    }
}
