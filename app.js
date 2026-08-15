const { createApp } = Vue;

/* ------------------------------------------------------------------ date --
 * NB: new Date("2026-07-30") viene interpretata come mezzanotte UTC, mentre
 * new Date() e' ora locale. Mescolarle sfasa il conteggio dei giorni nelle
 * ore notturne (in Italia fra mezzanotte e le 02:00). Qui lavoriamo sempre
 * su mezzanotti locali.
 * -------------------------------------------------------------------------- */
function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
const parseDate = (value) => {
    if (value instanceof Date) return startOfDay(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(value);
    return isNaN(d.getTime()) ? startOfDay(new Date()) : startOfDay(d);
};
// Differenza in giorni interi fra due mezzanotti locali (regge l'ora legale)
const diffDays = (d1, d2) => Math.round(
    (startOfDay(d1).getTime() - startOfDay(d2).getTime()) / 86400000
);
const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const formatDateStr = (date) =>
    `${String(date.getDate()).padStart(2, '0')} ${MESI[date.getMonth()]} ${date.getFullYear()}`;
const formatDateForInput = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const generateId = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }));

/* --------------------------------------------------------------- storage -- */
const KEY_MEDS = 'meds_inventory';
const KEY_EXPORT = 'meds_last_export';
const KEY_SNOOZE = 'meds_backup_snooze';
// Ogni quanti giorni ricordare il backup. 7 = una volta a settimana: allineato
// alla finestra di 7 giorni oltre la quale Safari puo' cancellare i dati locali.
const BACKUP_EVERY_DAYS = 7;

createApp({
    data() {
        return {
            meds: [],
            loading: true,
            error: null,
            today: startOfDay(new Date()),
            lastExport: null,   // stringa YYYY-MM-DD
            snoozeUntil: null,  // stringa YYYY-MM-DD
            storagePersisted: null, // true = protetto, false = negato, null = non supportato
            modal: { show: false, type: 'add', data: {} }
        };
    },
    computed: {
        processedMeds() {
            const today = this.today;

            return this.meds.map((med) => {
                const posology = Number(med.posology) || 0;
                const stock = Number(med.stock) || 0;
                const hasPosology = posology > 0;

                const lastUpdatedDate = parseDate(med.last_updated);
                const daysPassed = Math.max(0, diffDays(today, lastUpdatedDate));

                // Scorta stimata a inizio giornata di oggi
                const estimatedStock = Math.max(0, stock - daysPassed * posology);

                // Giorni ancora coperti (oggi incluso): la dose di oggi esce da
                // estimatedStock, quindi il primo giorno scoperto e' oggi + daysLeft.
                const daysLeft = hasPosology ? Math.floor(estimatedStock / posology) : Infinity;

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
                    daysLeftLabel: hasPosology ? `Fra ${daysLeft} giorni` : 'Al bisogno',
                    runOutLabel: hasPosology ? formatDateStr(addDays(today, daysLeft)) : '—',
                    barWidth: Math.min(100, (hasPosology ? daysLeft : 60) / 60 * 100),
                    statusColor,
                    bgClass
                };
            }).sort((a, b) => a.daysLeft - b.daysLeft);
        },
        daysSinceExport() {
            if (!this.lastExport) return null;
            return Math.max(0, diffDays(this.today, parseDate(this.lastExport)));
        },
        lastExportLabel() {
            if (!this.lastExport) return 'mai';
            const d = this.daysSinceExport;
            if (d === 0) return 'oggi';
            if (d === 1) return 'ieri';
            return `${formatDateStr(parseDate(this.lastExport))} (${d} giorni fa)`;
        },
        showBackupReminder() {
            if (this.loading || this.meds.length === 0) return false;
            if (this.snoozeUntil && diffDays(this.today, parseDate(this.snoozeUntil)) < 0) return false;
            const d = this.daysSinceExport;
            return d === null || d >= BACKUP_EVERY_DAYS;
        },
        backupReminderText() {
            return this.lastExport
                ? `Ultimo backup ${this.daysSinceExport} giorni fa. I dati stanno solo su questo dispositivo: esportali per non rischiare di perderli.`
                : "Non hai mai esportato i dati. Stanno solo su questo dispositivo: basta svuotare i dati del browser per perderli.";
        },
        storageLabel() {
            if (this.storagePersisted === true) return 'attiva';
            if (this.storagePersisted === false) return 'non concessa dal browser';
            return 'non supportata da questo browser';
        },
        storageLabelClass() {
            if (this.storagePersisted === true) return 'text-emerald-400';
            if (this.storagePersisted === false) return 'text-amber-400';
            return 'text-slate-400';
        },
        modalTitle() {
            if (this.modal.type === 'add') return 'Aggiungi Nuovo Farmaco';
            if (this.modal.type === 'edit') return 'Modifica Farmaco';
            if (this.modal.type === 'info') return "Guida all'uso";
            return 'Aggiorna Scorte Totali';
        }
    },
    methods: {
        formatDate(value) {
            if (!value) return '';
            return formatDateStr(parseDate(value));
        },

        /* ----------------------------------------------------------- dati -- */
        loadData() {
            this.loading = true;
            try {
                const stored = localStorage.getItem(KEY_MEDS);
                this.meds = stored ? JSON.parse(stored) : [];
                if (!Array.isArray(this.meds)) this.meds = [];
                this.lastExport = localStorage.getItem(KEY_EXPORT);
                this.snoozeUntil = localStorage.getItem(KEY_SNOOZE);
            } catch (err) {
                this.meds = [];
                this.error = 'Errore nel caricamento dei dati locali: ' + err.message;
            } finally {
                this.loading = false;
            }
        },
        /* Chiede al browser di NON cancellare automaticamente i dati di questo
         * sito quando fa pulizia (spazio esaurito, sito non visitato da giorni).
         * Non esiste un tag HTML per farlo: si passa dalla Storage API.
         * Chrome/Edge decidono da soli senza chiedere nulla all'utente e dicono
         * di si' soprattutto se l'app e' installata nella schermata Home.
         * Firefox mostra una richiesta di permesso.
         * Safari implementa l'API ma non garantisce di rispettarla: su iPhone
         * la protezione vera resta l'installazione in schermata Home.
         * In nessun caso protegge da una cancellazione manuale dei dati del
         * browser: il backup CSV resta indispensabile. */
        async requestPersistentStorage() {
            try {
                if (!navigator.storage || !navigator.storage.persist) {
                    this.storagePersisted = null;
                    return;
                }
                let ok = await navigator.storage.persisted();
                if (!ok) ok = await navigator.storage.persist();
                this.storagePersisted = ok;
            } catch (err) {
                this.storagePersisted = null;
            }
        },
        saveToStorage() {
            try {
                localStorage.setItem(KEY_MEDS, JSON.stringify(this.meds));
            } catch (err) {
                alert('Non e\' stato possibile salvare i dati sul dispositivo: ' + err.message);
            }
        },

        /* --------------------------------------------------------- modale -- */
        openModal(type, med = null) {
            this.modal.type = type;
            if (type === 'add') {
                this.modal.data = { name: '', posology: 1, stock: 0 };
            } else if (type === 'edit') {
                this.modal.data = { ...med };
            } else if (type === 'stock') {
                const current = this.processedMeds.find((m) => m.id === med.id);
                this.modal.data = { id: med.id, stock: current ? current.estimatedStock : 0 };
            } else {
                this.modal.data = {};
            }
            this.modal.show = true;
        },
        closeModal() {
            this.modal.show = false;
        },
        submitModal() {
            if (this.modal.type === 'add') {
                this.meds.push({
                    id: generateId(),
                    name: String(this.modal.data.name || '').trim(),
                    posology: Number(this.modal.data.posology) || 0,
                    stock: Number(this.modal.data.stock) || 0,
                    last_updated: formatDateForInput(new Date())
                });
            } else if (this.modal.type === 'edit') {
                const idx = this.meds.findIndex((m) => m.id === this.modal.data.id);
                if (idx !== -1) {
                    this.meds[idx].name = String(this.modal.data.name || '').trim();
                    this.meds[idx].posology = Number(this.modal.data.posology) || 0;
                }
            } else if (this.modal.type === 'stock') {
                const idx = this.meds.findIndex((m) => m.id === this.modal.data.id);
                if (idx !== -1) {
                    this.meds[idx].stock = Number(this.modal.data.stock) || 0;
                    this.meds[idx].last_updated = formatDateForInput(new Date());
                }
            }
            this.saveToStorage();
            this.closeModal();
        },
        deleteMed() {
            if (!confirm('Sei sicuro di voler rimuovere questo farmaco?')) return;
            this.meds = this.meds.filter((m) => m.id !== this.modal.data.id);
            this.saveToStorage();
            this.closeModal();
        },

        /* ------------------------------------------------------- promemoria */
        snoozeBackup() {
            const tomorrow = formatDateForInput(addDays(this.today, 1));
            this.snoozeUntil = tomorrow;
            localStorage.setItem(KEY_SNOOZE, tomorrow);
        },

        /* ----------------------------------------------------- import/export */
        exportCsv() {
            if (this.meds.length === 0) {
                alert('Nessun dato da esportare');
                return;
            }
            const csv = Papa.unparse(this.meds, {
                columns: ['id', 'name', 'posology', 'stock', 'last_updated']
            });
            const stamp = formatDateForInput(new Date());
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inventario_farmaci_${stamp}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            this.lastExport = stamp;
            localStorage.setItem(KEY_EXPORT, stamp);
            localStorage.removeItem(KEY_SNOOZE);
            this.snoozeUntil = null;
        },
        importCsv(event) {
            const file = event.target.files[0];
            if (!file) return;
            const input = event.target;

            Papa.parse(file, {
                header: true,
                dynamicTyping: false,
                skipEmptyLines: true,
                complete: (results) => {
                    input.value = '';
                    const rows = (results.data || []).filter((r) => r && (r.name || r.id));
                    if (rows.length === 0) {
                        alert('Nessun farmaco trovato nel file. Controlla che le colonne siano: id, name, posology, stock, last_updated.');
                        return;
                    }

                    const imported = rows.map((row) => ({
                        id: row.id ? String(row.id).trim() : generateId(),
                        name: String(row.name || 'Sconosciuto').trim(),
                        posology: Number(String(row.posology).replace(',', '.')) || 0,
                        stock: Number(String(row.stock).replace(',', '.')) || 0,
                        last_updated: /^\d{4}-\d{2}-\d{2}/.test(String(row.last_updated || ''))
                            ? String(row.last_updated).slice(0, 10)
                            : formatDateForInput(new Date())
                    }));

                    const sostituisci = confirm(
                        `Trovati ${imported.length} farmaci nel file.\n\n` +
                        'OK = SOSTITUISCI tutto l\'inventario attuale\n' +
                        'Annulla = UNISCI ai farmaci gia\' presenti'
                    );

                    if (sostituisci) {
                        if (this.meds.length > 0 &&
                            !confirm(`Attenzione: i ${this.meds.length} farmaci attuali verranno cancellati. Procedo?`)) {
                            return;
                        }
                        this.meds = imported;
                    } else {
                        const existing = new Set(this.meds.map((m) => m.id));
                        let aggiunti = 0;
                        for (const m of imported) {
                            if (existing.has(m.id)) m.id = generateId();
                            this.meds.push(m);
                            existing.add(m.id);
                            aggiunti++;
                        }
                        alert(`${aggiunti} farmaci aggiunti.`);
                    }
                    this.saveToStorage();
                },
                error: (err) => {
                    input.value = '';
                    alert('Errore nella lettura del file CSV: ' + err.message);
                }
            });
        }
    },
    mounted() {
        this.loadData();
        this.requestPersistentStorage();
        // Se l'app resta aperta oltre la mezzanotte, i conteggi si aggiornano da soli
        setInterval(() => {
            const now = startOfDay(new Date());
            if (now.getTime() !== this.today.getTime()) this.today = now;
        }, 60000);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;
            this.today = startOfDay(new Date());
            // Riprova: dopo l'installazione in schermata Home il browser
            // concede la protezione anche se prima l'aveva negata.
            if (this.storagePersisted !== true) this.requestPersistentStorage();
        });
    }
}).mount('#app');
