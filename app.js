const { createApp } = Vue;

// Native Date Utils
const parseDate = (str) => new Date(str);
const diffDays = (d1, d2) => Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};
const formatDateStr = (date) => {
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    return `${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
};
const formatDateForInput = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Generate UUID
const generateId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

createApp({
    data() {
        return {
            meds: [],
            loading: true,
            error: null,
            modal: {
                show: false,
                type: 'add', // 'add', 'edit', 'stock'
                data: {}
            }
        }
    },
    computed: {
        processedMeds() {
            const today = new Date();
            
            return this.meds.map(med => {
                const lastUpdatedDate = parseDate(med.last_updated);
                const daysPassed = Math.max(0, diffDays(today, lastUpdatedDate));
                const consumedDoses = daysPassed * med.posology;
                const estimatedStock = Math.max(0, med.stock - consumedDoses);
                
                const daysLeft = med.posology > 0 ? Math.floor(estimatedStock / med.posology) : 999;
                const runOutDate = addDays(today, daysLeft);
                
                let statusColor = 'text-green-400';
                let bgClass = 'bg-green-500';
                
                if (daysLeft <= 7) {
                    statusColor = 'text-red-400';
                    bgClass = 'bg-red-500';
                } else if (daysLeft <= 14) {
                    statusColor = 'text-amber-400';
                    bgClass = 'bg-amber-500';
                }
                
                return {
                    ...med,
                    estimatedStock: parseFloat(estimatedStock.toFixed(1)),
                    daysLeft,
                    runOutDate,
                    statusColor,
                    bgClass
                };
            }).sort((a, b) => a.daysLeft - b.daysLeft);
        },
        modalTitle() {
            if (this.modal.type === 'add') return 'Aggiungi Nuovo Farmaco';
            if (this.modal.type === 'edit') return 'Modifica Farmaco';
            return 'Aggiorna Scorte Totali';
        }
    },
    methods: {
        formatDate(dateStringOrObj) {
            if (!dateStringOrObj) return '';
            const d = typeof dateStringOrObj === 'string' ? parseDate(dateStringOrObj) : dateStringOrObj;
            return formatDateStr(d);
        },
        saveToStorage() {
            localStorage.setItem('meds_inventory', JSON.stringify(this.meds));
        },
        async fetchMeds() {
            this.loading = true;
            try {
                const stored = localStorage.getItem('meds_inventory');
                if (stored) {
                    this.meds = JSON.parse(stored);
                } else {
                    // Initialize empty or from old API if migrating
                    this.meds = [];
                }
            } catch (err) {
                this.error = "Errore nel caricamento dei dati locali.";
            } finally {
                this.loading = false;
                this.$nextTick(() => {
                    lucide.createIcons();
                });
            }
        },
        openModal(type, med = null) {
            this.modal.type = type;
            if (type === 'add') {
                this.modal.data = { name: '', posology: 1, stock: 0 };
            } else if (type === 'edit') {
                this.modal.data = { ...med };
            } else if (type === 'stock') {
                const currentMed = this.processedMeds.find(m => m.id === med.id);
                this.modal.data = { 
                    id: med.id, 
                    stock: currentMed.estimatedStock
                };
            }
            this.modal.show = true;
            setTimeout(() => lucide.createIcons(), 50);
        },
        closeModal() {
            this.modal.show = false;
        },
        async submitModal() {
            try {
                if (this.modal.type === 'add') {
                    this.modal.data.last_updated = formatDateForInput(new Date());
                    this.modal.data.id = generateId();
                    this.meds.push({...this.modal.data});
                } else if (this.modal.type === 'edit') {
                    const idx = this.meds.findIndex(m => m.id === this.modal.data.id);
                    if (idx !== -1) {
                        this.meds[idx].name = this.modal.data.name;
                        this.meds[idx].posology = this.modal.data.posology;
                    }
                } else if (this.modal.type === 'stock') {
                    const idx = this.meds.findIndex(m => m.id === this.modal.data.id);
                    if (idx !== -1) {
                        this.meds[idx].stock = this.modal.data.stock;
                        this.meds[idx].last_updated = formatDateForInput(new Date());
                    }
                }
                this.saveToStorage();
                this.closeModal();
                this.$nextTick(() => lucide.createIcons());
            } catch (err) {
                alert(err.message);
            }
        },
        async deleteMed() {
            if (!confirm('Sei sicuro di voler rimuovere questo farmaco?')) return;
            this.meds = this.meds.filter(m => m.id !== this.modal.data.id);
            this.saveToStorage();
            this.closeModal();
        },
        exportCsv() {
            if (this.meds.length === 0) {
                alert('Nessun dato da esportare');
                return;
            }
            const csv = Papa.unparse(this.meds, {
                columns: ['id', 'name', 'posology', 'stock', 'last_updated']
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `inventory_${formatDateForInput(new Date())}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },
        importCsv(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.errors.length > 0) {
                        alert('Errore nella lettura del file CSV');
                        console.error(results.errors);
                        return;
                    }
                    
                    const imported = results.data.map(row => ({
                        id: row.id ? String(row.id) : generateId(),
                        name: String(row.name || 'Sconosciuto'),
                        posology: Number(row.posology) || 0,
                        stock: Number(row.stock) || 0,
                        last_updated: row.last_updated || formatDateForInput(new Date())
                    }));
                    
                    if (confirm(`Trovati ${imported.length} farmaci nel CSV. Vuoi SOSTITUIRE tutto l'inventario attuale con questi dati? (OK per sostituire, Annulla per unire)`)) {
                        this.meds = imported;
                    } else {
                        // Merge, avoiding duplicate IDs
                        const existingIds = new Set(this.meds.map(m => m.id));
                        for (const m of imported) {
                            if (!existingIds.has(m.id)) {
                                this.meds.push(m);
                                existingIds.add(m.id);
                            }
                        }
                    }
                    
                    this.saveToStorage();
                    this.$nextTick(() => lucide.createIcons());
                    
                    // Reset input
                    event.target.value = '';
                    alert('Importazione completata con successo!');
                }
            });
        }
    },
    mounted() {
        this.fetchMeds();
    }
}).mount('#app');
