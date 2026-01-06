
const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCALHOST ? "http://localhost:3000" : "https://api.bangbin.my.id";

let currentUser = null;
let globalSettings = {};
let fullData = [];
let rawLaporanData = [];
let filteredData = [];
let activeLaporanView = 'data';
let chartInstances = {};
let cachedSiswaList = [];
let deleteType = null; 
let idToDelete = null;

function resolveImg(path) {
    if (!path) return 'https://placehold.co/150?text=No+Img';
    if (path.startsWith('http')) return path;
    return `${API_URL}${path}`;
}

// =======================================================
// 1. AUTHENTICATION
// =======================================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const btn = document.getElementById('loginButton');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...'; 
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/login-guru`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || "Login Gagal");
        if (data.role !== 'Guru' && data.role !== 'Admin') throw new Error("Akses Ditolak: Bukan akun Guru.");
        
        currentUser = data;
        sessionStorage.setItem('guruUser', JSON.stringify(data));
        initDashboard();
    } catch(err) {
        showModal(err.message, "Gagal Login");
    } finally {
        btn.innerHTML = originalText; 
        btn.disabled = false;
    }
});


// =======================================================
// FITUR UI TAMBAHAN
// =======================================================
function toggleSidebar() {
    document.body.classList.toggle('sidebar-collapsed');
}

async function initDashboard() {
    if (!currentUser) return;

    document.getElementById('login-container').style.display = 'none';
    document.getElementById('dashboard-container').style.display = 'flex';
    document.getElementById('guru-name-display').textContent = `${currentUser.nama} (${currentUser.kelas})`;
    document.querySelector('.sidebar-header h3').innerHTML = `<i class="fas fa-school"></i> ${currentUser.kelas}`;
    document.getElementById('span-kelas').textContent = currentUser.kelas;
    
    await loadGlobalSettings();
    populateProfileForm();
    renderNilaiMenu(); 
    
    openLaporanSub('grafik', document.querySelectorAll('.sub-link')[0]); 
    const navLaporan = document.getElementById('nav-laporan-parent');
    if (navLaporan) toggleSidebarDropdown(navLaporan);
}

async function loadGlobalSettings() {
    try {
        const res = await fetch(`${API_URL}/pengaturan`);
        const json = await res.json();
        globalSettings = json.data || {};
        if (globalSettings.infoSekolah && globalSettings.infoSekolah.logo) {
            document.getElementById('favicon').href = resolveImg(globalSettings.infoSekolah.logo);
        }
    } catch(e) { console.error("Gagal memuat pengaturan:", e); }
}

// =======================================================
// 2. NAVIGATION & UI HELPERS
// =======================================================
function toggleSidebarDropdown(element) {
    const submenu = element.nextElementSibling;
    const arrow = element.querySelector('.arrow-icon');
    if (submenu.style.display === 'none' || submenu.style.display === '') {
        submenu.style.display = 'block'; 
        if(arrow) arrow.classList.add('rotate'); 
        element.classList.add('active'); 
    } else {
        submenu.style.display = 'none'; 
        if(arrow) arrow.classList.remove('rotate'); 
        element.classList.remove('active');
    }
}

function openLaporanSub(view, element) {
    switchPage('page-laporan');
    document.querySelectorAll('.sub-link').forEach(el => el.classList.remove('active-sub'));
    if(element) element.classList.add('active-sub');
    switchLaporanView(view);
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => { 
        if(link.dataset.page) { 
            e.preventDefault(); 
            switchPage(link.dataset.page); 
        }
    });
});

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => { if(l.dataset.page) l.classList.remove('active'); });
    
    const targetPage = document.getElementById(pageId);
    if(targetPage) targetPage.classList.add('active');
    
    const link = document.querySelector(`[data-page="${pageId}"]`);
    if(link) link.classList.add('active');
    
    if (pageId === 'page-laporan') {
        if (fullData.length === 0) loadLaporanData();
    }
    else if (pageId === 'page-siswa') loadSiswaData();
    else if (pageId === 'page-sekolah') renderSekolahForms();
    else if (pageId === 'page-pengaturan') renderPengaturanForms();
    else if (pageId === 'page-galeri') renderGaleriForms();
    else if (pageId === 'page-kelas') renderKelasVisualForm();
    else if (pageId === 'page-pelajaran') initPagePelajaran(); 
    else if (pageId === 'page-tp-list') initPageTpList();
    else if (pageId === 'page-tp-koku') initPageTpKoku();
    else if (pageId === 'page-tp-ekstra') initPageTpEkstra();
    else if (pageId === 'page-absensi') initPageAbsensi();
    else if (pageId === 'page-nilai-koku') initPageNilaiKoku();    
    else if (pageId === 'page-jadpel') initPageJadwal();
    else if (pageId === 'page-piket') initPagePiket();    
}

// =======================================================
// 3. ABSENSI HARIAN (LOGIKA JURNAL KETIDAKHADIRAN)
// =======================================================

async function initPageAbsensi() {
    const today = new Date().toISOString().split('T')[0];
    const startInput = document.getElementById('filter-abs-start');
    const endInput = document.getElementById('filter-abs-end');
    
    if(startInput) startInput.value = today;
    if(endInput) endInput.value = today;
    
    loadAbsensiTable();
}

async function loadAbsensiTable() {
    const startInput = document.getElementById('filter-abs-start');
    const endInput = document.getElementById('filter-abs-end');
    
    if(!startInput || !endInput) return; 

    const startDate = startInput.value;
    const endDate = endInput.value;
    const tbody = document.querySelector('#table-absensi tbody');
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Memuat Data Ketidakhadiran...</td></tr>';

    try {
        const resAbsen = await fetch(`${API_URL}/absensi?startDate=${startDate}&endDate=${endDate}&kelas=${currentUser.kelas}`);
        const dataAbsen = await resAbsen.json();
        const absenList = dataAbsen.filter(a => a.keterangan !== 'Hadir');

        tbody.innerHTML = '';
        
        if (absenList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding: 30px; color: #10B981;">
                        <i class="fas fa-check-circle" style="font-size: 40px; margin-bottom: 10px;"></i><br>
                        <b>NIHIL</b><br>
                        Semua siswa Hadir pada rentang tanggal ini.
                    </td>
                </tr>`;
            return;
        }

        absenList.forEach((row, index) => {
            let badgeColor = '#EF4444'; 
            if(row.keterangan === 'Sakit') badgeColor = '#F59E0B'; 
            if(row.keterangan === 'Izin') badgeColor = '#3B82F6'; 
            
            const dateObj = new Date(row.tanggal);
            const formattedDate = dateObj.toLocaleDateString('id-ID');

            tbody.innerHTML += `
                <tr>
                    <td>${index + 1}</td>
                    <td><span style="font-weight:600; color:#475569;">${formattedDate}</span></td>
                    <td>
                        <div style="font-weight:600;">${row.nama}</div>
                        <div style="font-size:11px; color:#64748B;">${row.nomor_induk}</div>
                    </td>
                    <td>
                        <span style="background:${badgeColor}; color:white; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                            ${row.keterangan}
                        </span>
                    </td>
                    <td>${row.catatan || '-'}</td>
                    <td>
                        <button class="action-btn delete" onclick="deleteAbsensi('${row.id_absen}')" title="Hapus Data">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Gagal memuat data: ${err.message}</td></tr>`;
    }
}

async function openAbsensiModal() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('abs-input-date').value = today;
    
    document.getElementById('abs-input-ket').value = "";
    document.getElementById('abs-input-note').value = "";
    
    const select = document.getElementById('abs-input-siswa');
    select.innerHTML = '<option value="">Memuat siswa...</option>';
    
    try {
        const res = await fetch(`${API_URL}/siswa`);
        const allSiswa = await res.json();
        const classSiswa = allSiswa.filter(s => s.kelas === currentUser.kelas).sort((a,b) => a.nama.localeCompare(b.nama));
        
        select.innerHTML = '<option value="">- Pilih Siswa -</option>';
        classSiswa.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${s.nama}</option>`;
        });
        
        openModal('absensiModal');
    } catch (err) {
        showModal("Gagal memuat daftar siswa: " + err.message, "Error");
    }
}

document.getElementById('absensiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const idSiswa = document.getElementById('abs-input-siswa').value;
    const tanggal = document.getElementById('abs-input-date').value;
    const ket = document.getElementById('abs-input-ket').value;
    const note = document.getElementById('abs-input-note').value;

    if (!idSiswa || !tanggal || !ket) {
        showModal("Mohon lengkapi data wajib (Siswa, Tanggal, Keterangan).", "Peringatan");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/absensi`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id_siswa: idSiswa,
                tanggal: tanggal,
                keterangan: ket,
                catatan: note
            })
        });

        if(!res.ok) throw new Error("Gagal menyimpan data.");

        closeModal('absensiModal');
        showModal("Data ketidakhadiran berhasil disimpan.", "Sukses");
        
        const currentFilter = document.getElementById('filter-absensi-date').value;
        if (currentFilter === tanggal) {
            loadAbsensiTable();
        }
        
    } catch(err) {
        showModal(err.message, "Error");
    }
});

function deleteAbsensi(idAbsen) {
    idToDelete = idAbsen;
    deleteType = 'absensi'; 
    openModal('deleteConfirmModal');
}

async function saveNilaiTpKoku(idSiswa, idTpKoku, nilai) {

    
    try {
        const res = await fetch(`${API_URL}/nilai-tp-koku`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id_siswa: idSiswa,
                id_tp_koku: idTpKoku,
                nilai: nilai
            })
        });

        if (!res.ok) throw new Error("Gagal menyimpan ke server");


    } catch(err) {
        console.error("Gagal save nilai koku", err);
        // Tampilkan alert kecil agar user tahu jika gagal (karena koneksi putus misalnya)
        alert("Gagal menyimpan nilai. Periksa koneksi internet."); 
    }
}

// =======================================================
// FITUR REKAP ABSENSI (MODAL & KALKULASI)
// =======================================================

function openRekapAbsensiModal() {
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
    const today = date.toISOString().split('T')[0];

    document.getElementById('rekap-start-date').value = firstDay;
    document.getElementById('rekap-end-date').value = today;
    document.getElementById('rekap-effective-days').value = "";     
    document.querySelector('#table-rekap-absensi tbody').innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color:#aaa;">Masukkan Tanggal & Hari Efektif, lalu klik Proses.</td></tr>';
    
    openModal('rekapAbsensiModal');
}

async function generateRekapAbsensi() {
    const startDate = document.getElementById('rekap-start-date').value;
    const endDate = document.getElementById('rekap-end-date').value;
    const effectiveDays = parseInt(document.getElementById('rekap-effective-days').value);
    const tbody = document.querySelector('#table-rekap-absensi tbody');

    if (!startDate || !endDate) {
        alert("Harap isi rentang tanggal.");
        return;
    }
    if (!effectiveDays || effectiveDays <= 0) {
        alert("Harap isi Jumlah Hari Efektif dengan benar (angka > 0).");
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Sedang Menghitung...</td></tr>';

    try {
        const resSiswa = await fetch(`${API_URL}/siswa`);
        const allSiswa = await resSiswa.json();
        const classSiswa = allSiswa.filter(s => s.kelas === currentUser.kelas).sort((a,b) => a.nama.localeCompare(b.nama));

        if (classSiswa.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Tidak ada siswa di kelas ini.</td></tr>';
            return;
        }

        const resAbsen = await fetch(`${API_URL}/absensi?startDate=${startDate}&endDate=${endDate}&kelas=${currentUser.kelas}`);
        const dataAbsen = await resAbsen.json();

        let html = '';
        
        classSiswa.forEach((siswa, index) => {
            const records = dataAbsen.filter(a => a.id_siswa === siswa.id && a.keterangan !== 'Hadir');
            
            let sCount = 0;
            let iCount = 0;
            let aCount = 0;

            records.forEach(r => {
                if (r.keterangan === 'Sakit') sCount++;
                else if (r.keterangan === 'Izin') iCount++;
                else if (r.keterangan === 'Alpha') aCount++;
            });

            const totalTidakHadir = sCount + iCount + aCount;
            
            let kehadiranPersen = ((effectiveDays - totalTidakHadir) / effectiveDays) * 100;
            if (kehadiranPersen < 0) kehadiranPersen = 0;
            
            const persenString = (kehadiranPersen % 1 === 0) ? kehadiranPersen.toFixed(0) : kehadiranPersen.toFixed(1);

            let percentColor = 'var(--success-color)'; 
            if (kehadiranPersen < 90) percentColor = '#F59E0B'; 
            if (kehadiranPersen < 80) percentColor = '#EF4444'; 

            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td style="font-weight:600;">${siswa.nama}</td>
                    <td style="text-align: center;">${sCount > 0 ? sCount : '-'}</td>
                    <td style="text-align: center;">${iCount > 0 ? iCount : '-'}</td>
                    <td style="text-align: center;">${aCount > 0 ? `<span style="color:red; font-weight:bold;">${aCount}</span>` : '-'}</td>
                    <td style="text-align: center; font-weight:bold;">${totalTidakHadir}</td>
                    <td style="text-align: center; font-weight:bold; color: ${percentColor}; background: #F0F9FF;">
                        ${persenString}%
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Gagal memproses data: ${err.message}</td></tr>`;
    }
}

function printRekapAbsensi() {
    const tbody = document.querySelector('#table-rekap-absensi tbody');
    if(tbody.rows.length <= 1 && tbody.rows[0].innerText.includes('Masukkan')) {
        alert("Silakan proses data rekap terlebih dahulu.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();    
    const startDate = document.getElementById('rekap-start-date').value;
    const endDate = document.getElementById('rekap-end-date').value;
    const effDays = document.getElementById('rekap-effective-days').value;
    const info = globalSettings.infoSekolah || {};

    doc.setFontSize(14);
    doc.text(info.namaSekolah || "Sekolah", 105, 15, { align: "center" });
    doc.setFontSize(11);
    doc.text(`Rekapitulasi Absensi Kelas ${currentUser.kelas}`, 105, 22, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Periode: ${startDate} s/d ${endDate} (Hari Efektif: ${effDays} Hari)`, 105, 27, { align: "center" });
    doc.autoTable({
        html: '#table-rekap-absensi',
        startY: 35,
        theme: 'grid',
        headStyles: { fillColor: [52, 152, 219], textColor: 255 }, 
        styles: { fontSize: 9, cellPadding: 2, halign: 'center' },
        columnStyles: {
            0: { cellWidth: 10 }, 
            1: { halign: 'left' } 
        }
    });

    let finalY = doc.lastAutoTable.finalY + 15;
    if (finalY > 250) { doc.addPage(); finalY = 20; }
    
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const place = info.namaTempat || 'Tempat';

    doc.text(`${place}, ${today}`, 140, finalY);
    doc.text(`Guru Kelas ${currentUser.kelas}`, 140, finalY + 6);
    doc.text(currentUser.nama || '', 140, finalY + 30);
    doc.text(`NIP. ${currentUser.nip || '-'}`, 140, finalY + 35);
    doc.save(`Rekap_Absensi_${currentUser.kelas}.pdf`);
}


// =======================================================
// FILTER PENCARIAN DI TABEL NILAI
// =======================================================

function filterNilaiList() {
    const input = document.getElementById('filter-nama-nilai');
    const filter = input.value.toLowerCase();    
    const rows = document.querySelectorAll('#nilaiTable tbody tr');

    rows.forEach(row => {
        const tdNama = row.getElementsByTagName('td')[1];
        
        if (tdNama) {
            const textValue = tdNama.textContent || tdNama.innerText;
            if (textValue.toLowerCase().indexOf(filter) > -1) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        }
    });
}

// =======================================================
// 4. MENU NILAI (DINAMIS DARI DB & TP)
// =======================================================
async function renderNilaiMenu() {
    const container = document.getElementById('submenu-nilai');
    container.innerHTML = '<div style="padding:10px; font-size:12px; color:#aaa;">Memuat Mapel...</div>';
    
    try {
        const res = await fetch(`${API_URL}/mata-pelajaran`);
        if(!res.ok) throw new Error("Gagal load mapel");
        const mapelList = await res.json();
        
        if(mapelList.length === 0) {
            container.innerHTML = '<div style="padding:10px; font-size:12px; color:#aaa;">Belum ada mapel.</div>';
            return;
        }

        let html = '';
        mapelList.forEach(m => {
            html += `<a href="javascript:void(0)" class="nav-link sub-link" onclick="openNilaiPage(${m.id_mapel}, '${m.nama_mapel}')"><i class="fas fa-book-open"></i> ${m.nama_mapel}</a>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="padding:10px; font-size:12px; color:red;">Gagal memuat.</div>';
    }
}

let currentNilaiMapelId = null;

async function openNilaiPage(mapelId, mapelName) {
    switchPage('page-nilai-dynamic');
    document.getElementById('nilai-page-title').innerHTML = `<i class="fas fa-star"></i> Input Nilai: ${mapelName}`;
    currentNilaiMapelId = mapelId;
    await loadNilaiTable(mapelId);
}

async function refreshNilaiTable() {
    if(currentNilaiMapelId) await loadNilaiTable(currentNilaiMapelId);
}

// =======================================================
// LOGIKA TABEL NILAI (TP + SUMATIF + KALKULASI)
// =======================================================

async function loadNilaiTable(mapelId) {
    const thead = document.querySelector('#nilaiTable thead');
    const tbody = document.querySelector('#nilaiTable tbody');
    thead.innerHTML = '<tr><th>Loading Header...</th></tr>';
    tbody.innerHTML = '<tr><td>Loading Data...</td></tr>';

    try {
        const resTp = await fetch(`${API_URL}/tujuan-pembelajaran/${mapelId}`);
        const listTp = await resTp.json();

        if (listTp.length === 0) {
            thead.innerHTML = '<tr><th>Info</th></tr>';
            tbody.innerHTML = '<tr><td style="padding:20px; text-align:center;">Belum ada TP. Tambahkan di menu "Daftar TP".</td></tr>';
            return;
        }

        const resSiswa = await fetch(`${API_URL}/siswa`);
        const allSiswa = await resSiswa.json();
        const classSiswa = allSiswa.filter(s => s.kelas === currentUser.kelas).sort((a,b) => a.nama.localeCompare(b.nama));

        if (classSiswa.length === 0) {
            tbody.innerHTML = '<tr><td style="padding:20px; text-align:center;">Belum ada siswa.</td></tr>';
            return;
        }

        const resSum = await fetch(`${API_URL}/nilai-sumatif?id_mapel=${mapelId}&kelas=${currentUser.kelas}`);
        const dataSumatif = await resSum.json(); 

        let headerHtml = `<tr style="background:#F8FAFC;">
            <th style="width:40px; text-align:center; vertical-align:middle;">No</th>
            <th style="min-width:200px; vertical-align:middle;">Nama Siswa</th>`;
        
        listTp.forEach(tp => {
            headerHtml += `<th title="${tp.deskripsi_tp}" style="text-align:center; min-width:60px; font-size:11px; vertical-align:middle;">${tp.kode_tp}</th>`;
        });


        headerHtml += `
            <th style="text-align:center; background:#E0F2FE; color:#0284C7; width:80px; vertical-align:middle;">
                Rata TP<br>
                <div style="font-size:9px; color:#64748B; margin-bottom:2px;">Bobot</div>
                <input type="number" id="weight-tp" value="1" min="0" 
                    style="width:50px; text-align:center; padding:2px; font-size:11px; border:1px solid #0284C7; border-radius:4px;"
                    onchange="recalculateAllRows()">
            </th>
            <th style="text-align:center; background:#FEF3C7; color:#D97706; width:80px; vertical-align:middle;">
                SUM<br>
                <div style="font-size:9px; color:#64748B; margin-bottom:2px;">Bobot</div>
                <input type="number" id="weight-sum" value="1" min="0"
                    style="width:50px; text-align:center; padding:2px; font-size:11px; border:1px solid #D97706; border-radius:4px;"
                    onchange="recalculateAllRows()">
            </th>
            <th style="text-align:center; background:#DCFCE7; color:#16A34A; font-weight:bold; width:70px; vertical-align:middle;">R (Rapor)</th>
            
            <th style="text-align:center; font-size:11px; color:#64748B; min-width:220px; vertical-align:middle;">Deskripsi Tertinggi (MAX)</th>
            <th style="text-align:center; font-size:11px; color:#64748B; min-width:220px; vertical-align:middle;">Deskripsi Terendah (MIN)</th>
        </tr>`;
        thead.innerHTML = headerHtml;

        tbody.innerHTML = '';
        
        const gradePromises = classSiswa.map(async (siswa, index) => {
            const resNilai = await fetch(`${API_URL}/nilai-mapel?id_siswa=${siswa.id}&id_mapel=${mapelId}`);
            const dataNilai = await resNilai.json();
            return { siswa, dataNilai, index };
        });

        const results = await Promise.all(gradePromises);
        results.sort((a,b) => a.index - b.index);

        results.forEach(item => {
            const { siswa, dataNilai, index } = item;
            const recSum = dataSumatif.find(s => s.id_siswa === siswa.id);
            const valSum = recSum ? recSum.nilai : 0;

            let rowHtml = `<tr id="row-${siswa.id}">
                <td style="text-align:center; vertical-align:top;">${index + 1}</td>
                <td style="vertical-align:top;">
                    <div style="font-weight:600; font-size:13px;">${siswa.nama}</div>
                    <div style="font-size:10px; color:#94A3B8;">${siswa.nomor_induk}</div>
                </td>`;
            
            listTp.forEach(tp => {
                const gradeRecord = dataNilai.find(n => n.id_tp === tp.id_tp);
                const val = gradeRecord && gradeRecord.nilai !== null ? gradeRecord.nilai : 0;
                
                const safeDesc = tp.deskripsi_tp.replace(/"/g, '&quot;');
                
                rowHtml += `<td style="text-align:center; padding:5px; vertical-align:top;">
                    <input type="number" 
                           class="form-control input-tp-${siswa.id}" 
                           style="text-align:center; padding:5px; border:1px solid #CBD5E1;"
                           value="${val}" 
                           min="0" max="100"
                           data-deskripsi="${safeDesc}" 
                           onchange="saveNilaiSingle('${siswa.id}', ${tp.id_tp}, this.value); calculateRow('${siswa.id}')"
                           onkeyup="calculateRow('${siswa.id}')"
                    >
                </td>`;
            });

            const descStyle = `
                font-size: 11px; 
                color: #334155; 
                white-space: normal !important; 
                text-align: justify; 
                line-height: 1.4;
                min-width: 220px;
                max-width: 250px;
            `;

            rowHtml += `
                <td style="text-align:center; background:#F0F9FF; vertical-align:top;">
                    <span id="rata-tp-${siswa.id}" style="font-weight:600; color:#0284C7; display:block; margin-top:5px;">0</span>
                </td>
                
                <td style="text-align:center; background:#FFFBEB; padding:5px; vertical-align:top;">
                    <input type="number" 
                           id="input-sum-${siswa.id}"
                           class="form-control" 
                           style="text-align:center; padding:5px; border:1px solid #FCD34D; font-weight:600;"
                           value="${valSum}" 
                           min="0" max="100"
                           onchange="saveNilaiSumatif('${siswa.id}', ${mapelId}, this.value); calculateRow('${siswa.id}')"
                           onkeyup="calculateRow('${siswa.id}')"
                    >
                </td>

                <td style="text-align:center; background:#F0FDF4; vertical-align:top;">
                    <span id="nilai-rapor-${siswa.id}" style="font-weight:800; font-size:14px; color:#16A34A; display:block; margin-top:5px;">0</span>
                </td>

                <td style="vertical-align:top; padding: 10px;">
                    <div id="nilai-max-${siswa.id}" style="${descStyle}">-</div>
                </td>

                <td style="vertical-align:top; padding: 10px;">
                    <div id="nilai-min-${siswa.id}" style="${descStyle}">-</div>
                </td>
            </tr>`;
            
            tbody.innerHTML += rowHtml;
            
            setTimeout(() => calculateRow(siswa.id), 0);
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="15" style="color:red; text-align:center;">Gagal memuat: ${err.message}</td></tr>`;
    }
}

function recalculateAllRows() {
    const rows = document.querySelectorAll('tr[id^="row-"]');
    rows.forEach(row => {
        const idSiswa = row.id.replace('row-', '');
        calculateRow(idSiswa);
    });
}

// === FUNGSI KALKULASI PER BARIS (Updated with Predikat Logic) ===
function calculateRow(idSiswa) {
    const inputs = document.querySelectorAll(`.input-tp-${idSiswa}`);
    let totalTp = 0;
    let count = 0;    
    let maxVal = -Infinity;
    let minVal = Infinity;
    let maxDesc = '-';
    let minDesc = '-';
    let hasData = false;

    inputs.forEach(inp => {
        const val = parseFloat(inp.value) || 0;
        const tpDesc = inp.getAttribute('data-deskripsi') || ''; 
        
        totalTp += val;
        count++;
        
        const predikatLabel = getPredikatLabelByScore(val);
        const fullDeskripsi = `${predikatLabel} dalam ${tpDesc}`;

        if (val > maxVal) {
            maxVal = val;
            maxDesc = fullDeskripsi;
        }
        
        if (val < minVal) {
            minVal = val;
            minDesc = fullDeskripsi;
        }

        hasData = true;
    });

    if (!hasData || maxVal === -Infinity) {
        maxDesc = '-';
        minDesc = '-';
    } else {
        if (maxVal === minVal && count > 1) {
        }
    }

    const rataTp = count > 0 ? (totalTp / count) : 0;
    const inputSum = document.getElementById(`input-sum-${idSiswa}`);
    const valSum = parseFloat(inputSum.value) || 0;
    const weightTpEl = document.getElementById('weight-tp');
    const weightSumEl = document.getElementById('weight-sum');
    const bobotTp = weightTpEl ? (parseFloat(weightTpEl.value) || 0) : 1;
    const bobotSum = weightSumEl ? (parseFloat(weightSumEl.value) || 0) : 1;

    let pembagi = bobotTp + bobotSum;
    if (pembagi === 0) pembagi = 1;

    const nilaiRapor = ((rataTp * bobotTp) + (valSum * bobotSum)) / pembagi;

    document.getElementById(`rata-tp-${idSiswa}`).textContent = rataTp.toFixed(0); 
    document.getElementById(`nilai-rapor-${idSiswa}`).textContent = nilaiRapor.toFixed(0);
    document.getElementById(`nilai-max-${idSiswa}`).textContent = maxDesc;
    document.getElementById(`nilai-min-${idSiswa}`).textContent = minDesc;
    
}

// =======================================================
// FITUR PREDIKAT NILAI (KKM)
// =======================================================

function getPredikatSettings() {
    const defaultPredikat = {
        aMin: 90, aLabel: "Sangat Baik",
        bMin: 70, bLabel: "Baik",
        cMin: 60, cLabel: "Cukup",
        dLabel: "Perlu Peningkatan"
    };
    
    return globalSettings.predikatNilai || defaultPredikat;
}

function openPredikatNilaiModal() {
    const p = getPredikatSettings();
    document.getElementById('pred-a-min').value = p.aMin;
    document.getElementById('pred-a-label').value = p.aLabel;
    document.getElementById('pred-b-min').value = p.bMin;
    document.getElementById('pred-b-label').value = p.bLabel;
    document.getElementById('pred-c-min').value = p.cMin;
    document.getElementById('pred-c-label').value = p.cLabel;
    document.getElementById('pred-d-label').value = p.dLabel;
    openModal('predikatNilaiModal');
}

// Handler Simpan Predikat
document.getElementById('predikatNilaiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newPredikat = {
        aMin: parseInt(document.getElementById('pred-a-min').value),
        aLabel: document.getElementById('pred-a-label').value,
        bMin: parseInt(document.getElementById('pred-b-min').value),
        bLabel: document.getElementById('pred-b-label').value,
        cMin: parseInt(document.getElementById('pred-c-min').value),
        cLabel: document.getElementById('pred-c-label').value,
        dLabel: document.getElementById('pred-d-label').value
    };

    if (newPredikat.aMin <= newPredikat.bMin || newPredikat.bMin <= newPredikat.cMin) {
        showModal("Angka rentang nilai tidak logis. Pastikan A > B > C.", "Peringatan");
        return;
    }

    globalSettings.predikatNilai = newPredikat;
    
    try {
        await fetch(`${API_URL}/pengaturan`, { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ data: globalSettings }) 
        });
        
        closeModal('predikatNilaiModal');
        showModal("Konfigurasi Predikat Berhasil Disimpan!", "Sukses");
        
        recalculateAllRows();
        
    } catch(err) {
        showModal("Gagal menyimpan: " + err.message, "Error");
    }
});

function getPredikatLabelByScore(score) {
    const p = getPredikatSettings();
    
    if (score >= p.aMin) return p.aLabel;
    if (score >= p.bMin) return p.bLabel;
    if (score >= p.cMin) return p.cLabel;
    return p.dLabel;
}


// === FUNGSI SIMPAN ===

async function saveNilaiSumatif(idSiswa, idMapel, val) {
    if(val < 0 || val > 100) return;
    try {
        await fetch(`${API_URL}/nilai-sumatif`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id_siswa: idSiswa,
                id_mapel: idMapel,
                nilai: val === '' ? 0 : val
            })
        });
    } catch (err) {
        console.error("Gagal save Sumatif: " + err.message);
    }
}

async function saveNilaiSingle(idSiswa, idTp, val) {
    if(val < 0 || val > 100) {
        alert("Nilai harus 0-100");
        return;
    }
    try {
        await fetch(`${API_URL}/nilai-tp`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id_siswa: idSiswa,
                id_tp: idTp,
                nilai: val === '' ? 0 : val, 
                keterangan: '-' 
            })
        });
    } catch (err) {
        alert("Gagal menyimpan nilai: " + err.message);
    }
}

// =======================================================
// 5. MANAJEMEN TP (DAFTAR TP)
// =======================================================
async function initPageTpList() {
    const sel = document.getElementById('filter-mapel-tp');
    sel.innerHTML = '<option value="">Loading...</option>';
    try {
        const res = await fetch(`${API_URL}/mata-pelajaran`);
        const data = await res.json();
        sel.innerHTML = '<option value="">- Pilih Mapel -</option>';
        data.forEach(m => {
            sel.innerHTML += `<option value="${m.id_mapel}">${m.nama_mapel}</option>`;
        });
    } catch(e) { sel.innerHTML = '<option>Error loading mapel</option>'; }
}

async function loadTpByMapel() {
    const mapelId = document.getElementById('filter-mapel-tp').value;
    const tbody = document.querySelector('#table-tp tbody');
    
    if (!mapelId) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94A3B8;">Silakan pilih mata pelajaran terlebih dahulu.</td></tr>';
        return;
    }
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    
    try {
        const res = await fetch(`${API_URL}/tujuan-pembelajaran/${mapelId}`);
        const data = await res.json();
        
        tbody.innerHTML = '';
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Belum ada TP untuk mapel ini.</td></tr>';
        } else {
            data.forEach(tp => {
                const safeTp = JSON.stringify(tp).replace(/"/g, '&quot;');
                tbody.innerHTML += `
                    <tr>
                        <td><span style="background:#E0F2FE; color:#0369A1; padding:2px 8px; border-radius:4px; font-weight:600; font-size:12px;">${tp.kode_tp}</span></td>
                        <td>${tp.deskripsi_tp}</td>
                        <td>
                            <button class="action-btn edit" onclick="openTpModal(${safeTp})"><i class="fas fa-edit"></i></button>
                            <button class="action-btn delete" onclick="deleteTp(${tp.id_tp})"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:red">Error: ${err.message}</td></tr>`;
    }
}

function openTpModal(data = null) {
    const mapelId = document.getElementById('filter-mapel-tp').value;
    if (!mapelId && !data) {
        showModal("Pilih mata pelajaran di dropdown terlebih dahulu!", "Peringatan");
        return;
    }

    document.getElementById('tpId').value = data ? data.id_tp : '';
    document.getElementById('tpMapelId').value = data ? data.id_mapel : mapelId;
    document.getElementById('tpKode').value = data ? data.kode_tp : '';
    document.getElementById('tpDeskripsi').value = data ? data.deskripsi_tp : '';
    
    openModal('tpModal');
}

document.getElementById('tpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('tpId').value;
    const mapelId = document.getElementById('tpMapelId').value;
    const kode = document.getElementById('tpKode').value;
    const deskripsi = document.getElementById('tpDeskripsi').value;

    const url = id ? `${API_URL}/tujuan-pembelajaran/${id}` : `${API_URL}/tujuan-pembelajaran`;
    const method = id ? 'PUT' : 'POST';
    const body = { id_mapel: mapelId, kode_tp: kode, deskripsi_tp: deskripsi };

    try {
        const res = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if(!res.ok) throw new Error("Gagal menyimpan TP");
        
        closeModal('tpModal');
        loadTpByMapel(); 
        showModal("TP berhasil disimpan.", "Sukses");
    } catch(err) {
        showModal(err.message, "Error");
    }
});

function deleteTp(id) {
    deleteType = 'tp';
    idToDelete = id;
    openModal('deleteConfirmModal');
}

// =======================================================
// 6. LOGIKA P+E+K (PELAJARAN, EKSKUL, KOKURIKULER)
// =======================================================
async function initPagePelajaran() {
    loadMapel();
    loadEkskul();
    loadKoku();
}

async function loadMapel() {
    const tbody = document.querySelector('#table-mapel tbody');
    tbody.innerHTML = '<tr><td colspan="3"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    try {
        const res = await fetch(`${API_URL}/mata-pelajaran`);
        const data = await res.json();
        tbody.innerHTML = '';
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#94A3B8;">Belum ada Mata Pelajaran</td></tr>';
        } else {
            data.forEach(m => {
                const safeM = JSON.stringify(m).replace(/"/g, '&quot;');
                tbody.innerHTML += `
                <tr>
                    <td>${m.nama_mapel}</td>
                    <td>${m.singkatan || '-'}</td>
                    <td>
                        <button class="action-btn edit" onclick="openPekModal('mapel', ${safeM})"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deletePekData('mapel', ${m.id_mapel})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
    } catch(e) { tbody.innerHTML = `<tr><td colspan="3" style="color:red">Error: ${e.message}</td></tr>`; }
}

async function loadEkskul() {
    const tbody = document.querySelector('#table-ekskul tbody');
    tbody.innerHTML = '<tr><td colspan="2"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    try {
        const res = await fetch(`${API_URL}/ekstrakurikuler`);
        const data = await res.json();
        tbody.innerHTML = '';
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#94A3B8;">Belum ada Data</td></tr>';
        } else {
            data.forEach(e => {
                const safeE = JSON.stringify(e).replace(/"/g, '&quot;');
                tbody.innerHTML += `
                <tr>
                    <td>${e.nama_ekskul}</td>
                    <td>
                        <button class="action-btn edit" onclick="openPekModal('ekskul', ${safeE})"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deletePekData('ekskul', ${e.id_ekskul})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
    } catch(e) { tbody.innerHTML = `<tr><td colspan="2" style="color:red">Error: ${e.message}</td></tr>`; }
}

async function loadKoku() {
    const tbody = document.querySelector('#table-koku tbody');
    tbody.innerHTML = '<tr><td colspan="2"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    try {
        const res = await fetch(`${API_URL}/kokurikuler`);
        const data = await res.json();
        tbody.innerHTML = '';
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#94A3B8;">Belum ada Projek</td></tr>';
        } else {
            data.forEach(k => {
                const safeK = JSON.stringify(k).replace(/"/g, '&quot;');
                tbody.innerHTML += `
                <tr>
                    <td>${k.nama_projek}</td>
                    <td>
                        <button class="action-btn edit" onclick="openPekModal('koku', ${safeK})"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deletePekData('koku', ${k.id_koku})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
    } catch(e) { tbody.innerHTML = `<tr><td colspan="2" style="color:red">Error: ${e.message}</td></tr>`; }
}

function openPekModal(type, data = null) {
    const title = document.getElementById('pekModalTitle');
    const fields = document.getElementById('pekFormFields');
    const pekType = document.getElementById('pekType');
    const pekId = document.getElementById('pekId');
    
    pekType.value = type;
    pekId.value = data ? (data.id_mapel || data.id_ekskul || data.id_koku) : '';
    
    fields.innerHTML = ''; 

    if (type === 'mapel') {
        title.textContent = data ? "Edit Mata Pelajaran" : "Tambah Mata Pelajaran";
        fields.innerHTML = `
            <div class="form-group">
                <label>Nama Mata Pelajaran</label>
                <input type="text" id="pekNama" value="${data ? data.nama_mapel : ''}" required placeholder="Contoh: Matematika">
            </div>
            <div class="form-group">
                <label>Singkatan (Opsional)</label>
                <input type="text" id="pekKet" value="${data ? (data.singkatan || '') : ''}" placeholder="Contoh: MTK">
            </div>
        `;
    } else if (type === 'ekskul') {
        title.textContent = data ? "Edit Ekstrakurikuler" : "Tambah Ekstrakurikuler";
        fields.innerHTML = `
            <div class="form-group">
                <label>Nama Ekstrakurikuler</label>
                <input type="text" id="pekNama" value="${data ? data.nama_ekskul : ''}" required placeholder="Contoh: Futsal">
            </div>
        `;
    } else if (type === 'koku') {
        title.textContent = data ? "Edit Projek Kokurikuler" : "Tambah Projek Kokurikuler";
        fields.innerHTML = `
            <div class="form-group">
                <label>Nama Projek P5</label>
                <input type="text" id="pekNama" value="${data ? data.nama_projek : ''}" required placeholder="Contoh: Gaya Hidup Berkelanjutan">
            </div>
            <input type="hidden" id="pekDesc" value="-"> 
        `;
    }
    
    openModal('pekModal');
}

document.getElementById('pekForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('pekType').value;
    const id = document.getElementById('pekId').value;
    const nama = document.getElementById('pekNama').value;
    
    let url = '', body = {};
    const method = id ? 'PUT' : 'POST';

    if (type === 'mapel') {
        url = `${API_URL}/mata-pelajaran` + (id ? `/${id}` : '');
        body = { nama_mapel: nama, singkatan: document.getElementById('pekKet').value };
    } else if (type === 'ekskul') {
        url = `${API_URL}/ekstrakurikuler` + (id ? `/${id}` : '');
        body = { nama_ekskul: nama };

    } else if (type === 'koku') {
        url = `${API_URL}/kokurikuler` + (id ? `/${id}` : '');
        body = { nama_projek: nama, deskripsi: '-' };
    }

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error("Gagal menyimpan data");
        
        closeModal('pekModal');
        showModal("Data berhasil disimpan!", "Sukses");
        
        // --- BAGIAN INI YANG DIUPDATE ---
        if (type === 'mapel') { loadMapel(); renderNilaiMenu(); } 
        else if (type === 'ekskul') {
            loadEkskul();
            
            const pageTpEkstra = document.getElementById('page-tp-ekstra');
            if(pageTpEkstra && pageTpEkstra.classList.contains('active')) {
                initPageTpEkstra(); 
                const headerTitle = document.getElementById('ekskul-title-display');
                if(headerTitle) headerTitle.textContent = nama;
            }
        }
        else if (type === 'koku') loadKoku();
        // --------------------------------

    } catch (err) {
        showModal(err.message, "Error");
    }
});

function deletePekData(type, id) {
    idToDelete = id;
    deleteType = type;
    openModal('deleteConfirmModal');
}


document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
    if (!idToDelete) return;

    let url = '';
    if (deleteType === 'siswa') url = `${API_URL}/siswa/${idToDelete}`;
    else if (deleteType === 'mapel') url = `${API_URL}/mata-pelajaran/${idToDelete}`;
    else if (deleteType === 'ekskul') url = `${API_URL}/ekstrakurikuler/${idToDelete}`;
    else if (deleteType === 'tp-ekstra') url = `${API_URL}/tp-ekstrakurikuler/${idToDelete}`;
    else if (deleteType === 'koku') url = `${API_URL}/kokurikuler/${idToDelete}`;
    else if (deleteType === 'tp') url = `${API_URL}/tujuan-pembelajaran/${idToDelete}`;
    else if (deleteType === 'laporan') url = `${API_URL}/laporan?id=${idToDelete}`;
    else if (deleteType === 'absensi') url = `${API_URL}/absensi/${idToDelete}`;
    else if (deleteType === 'tp-koku') url = `${API_URL}/tp-kokurikuler/${idToDelete}`;

    try {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error("Gagal menghapus");
        
        closeModal('deleteConfirmModal');
        showModal("Data berhasil dihapus.", "Sukses");

        // --- BAGIAN INI YANG DIUPDATE ---
        if (deleteType === 'siswa') loadSiswaData();
        else if (deleteType === 'mapel') { loadMapel(); renderNilaiMenu(); }
        else if (deleteType === 'ekskul') {
            loadEkskul(); 
            const pageTpEkstra = document.getElementById('page-tp-ekstra');
            if(pageTpEkstra && pageTpEkstra.classList.contains('active')) {
                initPageTpEkstra(); 
                document.getElementById('ekstra-content-area').style.display = 'none'; // Sembunyikan tabel
            }
        }
        else if (deleteType === 'tp-ekstra') {
            loadTpEkstraTable(); 
        }        
        else if (deleteType === 'koku') loadKoku();
        else if (deleteType === 'tp') loadTpByMapel();
        else if (deleteType === 'laporan') loadLaporanData();
        else if (deleteType === 'absensi') loadAbsensiTable(); 
        else if (deleteType === 'tp-koku') { 
            const idKoku = document.getElementById('filter-koku-projek').value;
            if(idKoku) loadTpKokuTable(idKoku);
        }
        // --------------------------------
        
    } catch (err) {
        showModal("Gagal menghapus: " + err.message, "Error");
    } finally {
        idToDelete = null;
        deleteType = null;
    }
});

// =======================================================
// MANAJEMEN TP EKSTRAKURIKULER
// =======================================================

async function initPageTpEkstra() {
    const sel = document.getElementById('filter-ekskul-tp');
    sel.innerHTML = '<option value="">Loading...</option>';
    document.getElementById('ekstra-content-area').style.display = 'none';

    try {
        const res = await fetch(`${API_URL}/ekstrakurikuler`);
        const data = await res.json();
        
        sel.innerHTML = '<option value="">- Pilih Ekstrakurikuler -</option>';
        if (data.length === 0) {
            sel.innerHTML = '<option value="">Belum ada Data Ekskul</option>';
        } else {
            data.forEach(e => {
                sel.innerHTML += `<option value="${e.id_ekskul}">${e.nama_ekskul}</option>`;
            });
        }
    } catch(e) { sel.innerHTML = '<option>Error memuat data</option>'; }
}

async function loadTpEkstraTable() {
    const sel = document.getElementById('filter-ekskul-tp');
    const contentArea = document.getElementById('ekstra-content-area');
    const idEkskul = sel.value;
    
    // Ambil teks nama ekskul dari dropdown yang dipilih
    const selectedText = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';

    if (!idEkskul) {
        contentArea.style.display = 'none';
        return;
    }
    contentArea.style.display = 'block';

    // --- LOGIKA BARU: SETUP HEADER EKSKUL ---
    const titleEl = document.getElementById('ekskul-title-display');
    if(titleEl) titleEl.textContent = selectedText;
    
    // Setup Tombol Edit Header
    const btnEdit = document.getElementById('btn-edit-ekskul-header');
    if(btnEdit) {
        btnEdit.onclick = function() {
            const dataEkskul = { id_ekskul: idEkskul, nama_ekskul: selectedText };
            openPekModal('ekskul', dataEkskul);
        };
    }

    const btnDelete = document.getElementById('btn-delete-ekskul-header');
    if(btnDelete) {
        btnDelete.onclick = function() {
            deletePekData('ekskul', idEkskul);
        };
    }
    // ----------------------------------------

    const tbody = document.querySelector('#table-tp-ekstra tbody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Memuat TP...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/tp-ekstrakurikuler/${idEkskul}`);
        const data = await res.json();

        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#94A3B8;">Belum ada TP untuk ekskul ini.</td></tr>';
        } else {
            data.forEach((tp, index) => {
                const safeTp = JSON.stringify(tp).replace(/"/g, '&quot;');
                tbody.innerHTML += `
                    <tr>
                        <td style="text-align:center;">${index + 1}</td>
                        <td>${tp.deskripsi_tp}</td>
                        <td style="text-align: right;">
                            <button class="action-btn edit" onclick="openTpEkstraModal(${safeTp})" title="Edit TP"><i class="fas fa-edit"></i></button>
                            <button class="action-btn delete" onclick="deleteTpEkstra(${tp.id_tp_ekstra})" title="Hapus TP"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:red;">Error: ${err.message}</td></tr>`;
    }
}

function openTpEkstraModal(data = null) {
    const idEkskul = document.getElementById('filter-ekskul-tp').value;
    if (!idEkskul && !data) {
        alert("Pilih Ekstrakurikuler terlebih dahulu.");
        return;
    }

    document.getElementById('tpEkstraId').value = data ? data.id_tp_ekstra : '';
    document.getElementById('tpEkstraRefId').value = idEkskul;
    document.getElementById('tpEkstraDeskripsi').value = data ? data.deskripsi_tp : '';

    openModal('tpEkstraModal');
}

document.getElementById('tpEkstraForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('tpEkstraId').value;
    const idEkskul = document.getElementById('tpEkstraRefId').value;
    const deskripsi = document.getElementById('tpEkstraDeskripsi').value;

    const url = id ? `${API_URL}/tp-ekstrakurikuler/${id}` : `${API_URL}/tp-ekstrakurikuler`;
    const method = id ? 'PUT' : 'POST';
    const body = { id_ekskul: idEkskul, deskripsi_tp: deskripsi };

    try {
        const res = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        
        if(!res.ok) throw new Error("Gagal menyimpan TP");

        if (id) {
            closeModal('tpEkstraModal');
        } else {
            document.getElementById('tpEkstraDeskripsi').value = '';
            document.getElementById('tpEkstraDeskripsi').focus();
            showModal("TP berhasil ditambahkan. Silakan input lagi jika ada.", "Sukses");
        }

        loadTpEkstraTable(); 
        
        if(id) showModal("TP Ekstrakurikuler berhasil diperbarui.", "Sukses");

    } catch (err) {
        showModal(err.message, "Error");
    }
});

function deleteTpEkstra(id) {
    idToDelete = id;
    deleteType = 'tp-ekstra';
    openModal('deleteConfirmModal');
}


// =======================================================
// 16. INPUT NILAI EKSTRAKURIKULER (MATRIX DINAMIS)
// =======================================================

// Panggil fungsi ini di switchPage
async function initPageNilaiEkstra() {
    await loadNilaiEkstraTable();
}

async function loadNilaiEkstraTable() {
    const table = document.getElementById('table-nilai-ekstra');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    thead.innerHTML = '<tr><th colspan="10"><i class="fas fa-spinner fa-spin"></i> Memuat Data Ekskul...</th></tr>';
    tbody.innerHTML = '';

    try {
        const res = await fetch(`${API_URL}/nilai-ekstra-matrix?kelas=${currentUser.kelas}`);
        const data = await res.json();
        
        const { ekskuls, tps, siswa, nilai } = data;

        if (ekskuls.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td style="padding:20px; text-align:center;">Belum ada Data Ekstrakurikuler. Tambahkan di menu P+E+K.</td></tr>';
            return;
        }

        if (siswa.length === 0) {
            tbody.innerHTML = '<tr><td style="padding:20px; text-align:center;">Belum ada siswa di kelas ini.</td></tr>';
            return;
        }

        // --- STEP 1: RENDER HEADER ---
        
        let hRow1 = `<tr>
            <th rowspan="2" style="width:40px; text-align:center; vertical-align:middle; position:sticky; left:0; background:#F8FAFC; z-index:20; border-bottom:2px solid #cbd5e1; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);">No</th>
            <th rowspan="2" style="width:200px; vertical-align:middle; position:sticky; left:40px; background:#F8FAFC; border-right:2px solid #cbd5e1; z-index:20; border-bottom:2px solid #cbd5e1; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);">Nama Siswa</th>`;
        
        let hRow2 = `<tr>`;

        ekskuls.forEach(e => {
            hRow1 += `<th colspan="2" style="text-align:center; background:#E0F2FE; color:#0369A1; border-right:1px solid #94A3B8; border-bottom:1px solid #94A3B8;">${e.nama_ekskul}</th>`;
            
            hRow2 += `
                <th style="width:90px; text-align:center; background:#F1F5F9; border-bottom:2px solid #cbd5e1; font-size:10px;">Predikat</th>
                <th style="min-width:180px; text-align:center; background:#F1F5F9; border-right:1px solid #cbd5e1; border-bottom:2px solid #cbd5e1; font-size:10px;">Capaian TP</th>
            `;
        });

        hRow1 += `</tr>`;
        hRow2 += `</tr>`;

        thead.innerHTML = hRow1 + hRow2;

        // --- STEP 2: RENDER BODY ---
        let bodyHtml = '';

        siswa.forEach((s, sIdx) => {
            bodyHtml += `<tr>
                <td style="text-align:center; position:sticky; left:0; background:white; z-index:10; border-right:1px solid #eee; border-bottom:1px solid #eee;">${sIdx+1}</td>
                <td style="font-weight:600; position:sticky; left:40px; background:white; z-index:10; border-right:2px solid #cbd5e1; border-bottom:1px solid #eee;">
                    <div style="font-size:13px;">${s.nama}</div>
                    <div style="font-size:10px; color:#94A3B8;">${s.nomor_induk}</div>
                </td>`;

            ekskuls.forEach(e => {
                // Filter TP khusus untuk Ekskul ini
                const currentEkskulTps = tps.filter(t => t.id_ekskul === e.id_ekskul);                
                const existing = nilai.find(n => n.id_siswa === s.id && n.id_ekskul === e.id_ekskul);
                const valPredikat = existing ? existing.nilai : "";
                const valTp = existing ? existing.id_tp_ekstra : "";
                const inputIdPred = `ne-pred-${s.id}-${e.id_ekskul}`;
                const inputIdTp = `ne-tp-${s.id}-${e.id_ekskul}`;

                // --- DROPDOWN PREDIKAT ---
                let optPred = `<option value="" style="color:#ccc;">-</option>`;
                const predikats = [
                    {code:'SB', color:'#16A34A'}, {code:'BSH', color:'#2563EB'}, 
                    {code:'MB', color:'#D97706'}, {code:'BB', color:'#DC2626'}
                ];
                predikats.forEach(p => {
                    const sel = valPredikat === p.code ? 'selected' : '';
                    optPred += `<option value="${p.code}" ${sel} style="color:${p.color}; font-weight:bold;">${p.code}</option>`;
                });

                // --- DROPDOWN TP ---
                let optTp = `<option value="" style="color:#ccc;">- Pilih TP -</option>`;
                currentEkskulTps.forEach(t => {
                    const sel = (valTp == t.id_tp_ekstra) ? 'selected' : ''; // Use == for loose comparison (int vs string)
                    const shortDesc = t.deskripsi_tp.length > 50 ? t.deskripsi_tp.substring(0, 50) + '...' : t.deskripsi_tp;
                    optTp += `<option value="${t.id_tp_ekstra}" ${sel} title="${t.deskripsi_tp}">${shortDesc}</option>`;
                });

                bodyHtml += `
                    <td style="padding:5px; text-align:center; border-bottom:1px solid #eee;">
                        <select id="${inputIdPred}" class="form-control" style="font-weight:bold; text-align:center;"
                            onchange="saveNilaiEkstra('${s.id}', '${e.id_ekskul}')">
                            ${optPred}
                        </select>
                    </td>
                    <td style="padding:5px; border-right:1px solid #eee; border-bottom:1px solid #eee;">
                        <select id="${inputIdTp}" class="form-control" style="font-size:11px;"
                            onchange="saveNilaiEkstra('${s.id}', '${e.id_ekskul}')">
                            ${optTp}
                        </select>
                    </td>
                `;
            });

            bodyHtml += `</tr>`;
        });

        tbody.innerHTML = bodyHtml;

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="20" style="color:red; text-align:center;">Gagal memuat: ${err.message}</td></tr>`;
    }
}

async function saveNilaiEkstra(idSiswa, idEkskul) {
    const predVal = document.getElementById(`ne-pred-${idSiswa}-${idEkskul}`).value;
    const tpVal = document.getElementById(`ne-tp-${idSiswa}-${idEkskul}`).value;
    
    try {
        const res = await fetch(`${API_URL}/nilai-ekstra`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id_siswa: idSiswa,
                id_ekskul: idEkskul,
                id_tp_ekstra: tpVal, 
                nilai: predVal       
            })
        });

        if (!res.ok) throw new Error("Gagal menyimpan");
        
        const el1 = document.getElementById(`ne-pred-${idSiswa}-${idEkskul}`);
        const el2 = document.getElementById(`ne-tp-${idSiswa}-${idEkskul}`);
        el1.style.borderColor = '#2ECC71'; 
        el2.style.borderColor = '#2ECC71';
        setTimeout(() => { 
            el1.style.borderColor = '#CBD5E1'; 
            el2.style.borderColor = '#CBD5E1'; 
        }, 1000);

    } catch(err) {
        alert("Gagal menyimpan nilai ekskul: " + err.message);
    }
}


// =======================================================
// 14. MANAJEMEN TP KOKURIKULER (P5)
// =======================================================

async function initPageTpKoku() {
    loadKoku();
    const sel = document.getElementById('filter-koku-projek');
    sel.innerHTML = '<option value="">Loading...</option>';
    document.getElementById('koku-content-area').style.display = 'none';

    try {
        const res = await fetch(`${API_URL}/kokurikuler`);
        const data = await res.json();
        sel.innerHTML = '<option value="">- Pilih Tema / Projek -</option>';
        if (data.length === 0) {
            sel.innerHTML = '<option value="">Belum ada Projek di Menu P+E+K</option>';
        } else {
            data.forEach(p => {
                const safeKegiatan = (p.kegiatan || '').replace(/"/g, '&quot;');
                sel.innerHTML += `<option value="${p.id_koku}" data-kegiatan="${safeKegiatan}">${p.nama_projek}</option>`;
            });
        }
    } catch(e) { sel.innerHTML = '<option>Error memuat data</option>'; }
}

async function loadKokuDetails() {
    const sel = document.getElementById('filter-koku-projek');
    const idKoku = sel.value;
    const contentArea = document.getElementById('koku-content-area');
    
    if (!idKoku) {
        contentArea.style.display = 'none';
        return;
    }

    contentArea.style.display = 'block';

    const selectedOpt = sel.options[sel.selectedIndex];
    const kegiatan = selectedOpt.getAttribute('data-kegiatan');
    document.getElementById('koku-kegiatan').value = kegiatan || '';

    loadTpKokuTable(idKoku);
}

async function saveKokuKegiatan() {
    const idKoku = document.getElementById('filter-koku-projek').value;
    const kegiatan = document.getElementById('koku-kegiatan').value;

    if(!idKoku) return;

    try {
        const res = await fetch(`${API_URL}/kokurikuler/kegiatan/${idKoku}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ kegiatan: kegiatan })
        });
        
        if(!res.ok) throw new Error("Gagal menyimpan");
        
        const sel = document.getElementById('filter-koku-projek');
        sel.options[sel.selectedIndex].setAttribute('data-kegiatan', kegiatan);
        
        showModal("Kegiatan Projek Berhasil Disimpan", "Sukses");
    } catch (err) {
        showModal(err.message, "Error");
    }
}

async function loadTpKokuTable(idKoku) {
    const tbody = document.querySelector('#table-tp-koku tbody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Memuat TP...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/tp-kokurikuler/${idKoku}`);
        const data = await res.json();

        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#94A3B8;">Belum ada TP untuk projek ini.</td></tr>';
        } else {
            let currentDimensi = null;

            data.forEach(tp => {
                const safeTp = JSON.stringify(tp).replace(/"/g, '&quot;');

                if (tp.dimensi !== currentDimensi) {
                    tbody.innerHTML += `
                        <tr style="background-color: #F0F9FF; border-left: 4px solid var(--primary-color);">
                            <td colspan="3" style="font-weight: 700; color: var(--primary-color); font-size: 13px; padding-top: 15px;">
                                <i class="fas fa-layer-group"></i> Dimensi: ${tp.dimensi}
                            </td>
                        </tr>
                    `;
                    currentDimensi = tp.dimensi;
                }

                tbody.innerHTML += `
                    <tr>
                        <td style="width: 50px;"></td> <td style="position: relative;">
                            <div style="font-size: 13px; color: #334155;">${tp.deskripsi_tp}</div>
                        </td>
                        <td style="width: 100px; text-align: right;">
                            <button class="action-btn edit" onclick="openTpKokuModal(${safeTp})" title="Edit TP"><i class="fas fa-edit"></i></button>
                            <button class="action-btn delete" onclick="deleteTpKoku(${tp.id_tp_koku})" title="Hapus TP"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:red;">Error: ${err.message}</td></tr>`;
    }
}

function openTpKokuModal(data = null) {
    const idKoku = document.getElementById('filter-koku-projek').value;
    if (!idKoku && !data) return;

    document.getElementById('tpKokuId').value = data ? data.id_tp_koku : '';
    document.getElementById('tpKokuProjekId').value = idKoku;
    document.getElementById('tpKokuDimensi').value = data ? data.dimensi : '';
    document.getElementById('tpKokuDeskripsi').value = data ? data.deskripsi_tp : '';

    openModal('tpKokuModal');
}

document.getElementById('tpKokuForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('tpKokuId').value;
    const idKoku = document.getElementById('tpKokuProjekId').value;
    const dimensi = document.getElementById('tpKokuDimensi').value;
    const deskripsi = document.getElementById('tpKokuDeskripsi').value;

    const url = id ? `${API_URL}/tp-kokurikuler/${id}` : `${API_URL}/tp-kokurikuler`;
    const method = id ? 'PUT' : 'POST';
    const body = { id_koku: idKoku, dimensi: dimensi, deskripsi_tp: deskripsi };

    try {
        const res = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        
        if(!res.ok) throw new Error("Gagal menyimpan TP");

        if (id) {
            closeModal('tpKokuModal');
        } else {
            document.getElementById('tpKokuDeskripsi').value = '';
            document.getElementById('tpKokuDeskripsi').focus(); 
        }

        loadTpKokuTable(idKoku); 
        
        if(id) showModal("TP Kokurikuler berhasil diperbarui.", "Sukses");

    } catch (err) {
        showModal(err.message, "Error");
    }
});

function deleteTpKoku(id) {    
    idToDelete = id;
    deleteType = 'tp-koku'; 
    openModal('deleteConfirmModal');
}


// =======================================================
// 15. LOGIKA NILAI KOKURIKULER (MATRIX PREDIKAT P5) - FIXED & ROBUST
// =======================================================

const P5_PREDIKATS = [
    { code: 'SB',  label: 'Sangat Berkembang',          weight: 4, color: '#16A34A' }, 
    { code: 'BSH', label: 'Berkembang Sesuai Harapan',  weight: 3, color: '#2563EB' }, 
    { code: 'MB',  label: 'Mulai Berkembang',           weight: 2, color: '#D97706' }, 
    { code: 'BB',  label: 'Belum Berkembang',           weight: 1, color: '#DC2626' }  
];

async function initPageNilaiKoku() {
    await loadNilaiKokuTable();
}


async function loadNilaiKokuTable() {
    const table = document.getElementById('table-nilai-koku');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    thead.innerHTML = '<tr><th colspan="10"><i class="fas fa-spinner fa-spin"></i> Memuat Data Matrix P5...</th></tr>';
    tbody.innerHTML = '';

    try {
        const res = await fetch(`${API_URL}/nilai-koku-matrix?kelas=${currentUser.kelas}`);
        const data = await res.json();
        
        const { projects, tps, siswa, nilai } = data;

        if (projects.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td style="padding:20px; text-align:center;">Belum ada Projek P5. Silakan buat Tema Projek terlebih dahulu.</td></tr>';
            return;
        }

        if (siswa.length === 0) {
            tbody.innerHTML = '<tr><td style="padding:20px; text-align:center;">Belum ada siswa di kelas ini.</td></tr>';
            return;
        }

        const projectStructure = projects.map(p => {
            const pTps = tps.filter(t => t.id_koku === p.id_koku);
            const dimGroups = {};
            pTps.forEach(t => {
                if(!dimGroups[t.dimensi]) dimGroups[t.dimensi] = [];
                dimGroups[t.dimensi].push(t);
            });
            return { ...p, dimensions: dimGroups, totalTps: pTps.length };
        });

        const totalAllTps = projectStructure.reduce((acc, curr) => acc + curr.totalTps, 0);
        if (totalAllTps === 0) {
             tbody.innerHTML = `<tr><td style="padding:20px; text-align:center; color:#F59E0B;">
                <i class="fas fa-exclamation-triangle"></i> Tema Projek ditemukan, namun <b>belum ada Tujuan Pembelajaran (TP)</b>.<br>
                Silakan masuk ke menu <b>TP Koku</b> untuk menambahkan TP pada Tema Projek.
             </td></tr>`;
             thead.innerHTML = '';
             return;
        }

        // --- STEP 2: RENDER HEADER (INPUT DULU, BARU DESKRIPSI) ---
        
        let hRow1 = `<tr>
            <th rowspan="3" style="width:40px; text-align:center; vertical-align:middle; position:sticky; left:0; background:#F8FAFC; z-index:20; border-bottom:2px solid #cbd5e1; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);">No</th>
            <th rowspan="3" style="width:200px; vertical-align:middle; position:sticky; left:40px; background:#F8FAFC; border-right:2px solid #cbd5e1; z-index:20; border-bottom:2px solid #cbd5e1; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);">Nama Siswa</th>`;
        
        let hRow2 = `<tr>`;
        let hRow3 = `<tr>`;

        projectStructure.forEach(p => {
            if(p.totalTps === 0) return;
            hRow1 += `<th colspan="${p.totalTps}" style="text-align:center; background:#E0F2FE; color:#0369A1; border-right:1px solid #ddd; border-bottom:1px solid #ddd;">INPUT: ${p.nama_projek}</th>`;
            
            Object.keys(p.dimensions).forEach(dimName => {
                const dimTps = p.dimensions[dimName];
                hRow2 += `<th colspan="${dimTps.length}" style="text-align:center; font-size:10px; background:#F1F5F9; border-right:1px solid #ddd; border-bottom:1px solid #ddd; color:#475569;">${dimName}</th>`;
                
                dimTps.forEach((tp, idx) => {
                    hRow3 += `<th title="${tp.deskripsi_tp}" style="text-align:center; min-width:60px; font-size:10px; cursor:help; background:white; border-right:1px solid #eee; border-bottom:2px solid #cbd5e1;">TP.${idx+1}</th>`;
                });
            });
        });

        const activeProjectsCount = projectStructure.filter(p => p.totalTps > 0).length;
        if(activeProjectsCount > 0) {
            hRow1 += `<th colspan="${activeProjectsCount}" style="text-align:center; background:#FFFBEB; color:#B45309; border-left:2px solid #cbd5e1; border-bottom:1px solid #ddd;">HASIL DESKRIPSI (RAPOR)</th>`;
            
            projectStructure.forEach(p => {
                if(p.totalTps === 0) return;
                hRow2 += `<th style="text-align:center; min-width:250px; background:#FFFBEB; font-size:11px; border-left:1px solid #FDE68A; border-bottom:1px solid #ddd;">${p.nama_projek}</th>`;
                hRow3 += `<th style="text-align:center; background:#FFFBEB; font-size:10px; border-left:1px solid #FDE68A; border-bottom:2px solid #cbd5e1;">Narasi Otomatis</th>`;
            });
        }

        thead.innerHTML = hRow1 + '</tr>' + hRow2 + '</tr>' + hRow3 + '</tr>';

        let bodyHtml = '';
        
        siswa.forEach((s, sIdx) => {
            bodyHtml += `<tr>
                <td style="text-align:center; position:sticky; left:0; background:white; z-index:10; border-right:1px solid #eee; border-bottom:1px solid #eee;">${sIdx+1}</td>
                <td style="font-weight:600; position:sticky; left:40px; background:white; z-index:10; border-right:2px solid #cbd5e1; border-bottom:1px solid #eee;">
                    <div style="font-size:13px;">${s.nama}</div>
                    <div style="font-size:10px; color:#94A3B8;">${s.nomor_induk}</div>
                </td>`;

            let inputsDataPerSiswa = {}; 

            projectStructure.forEach(p => {
                if(p.totalTps === 0) return;
                
                const projectInputIds = [];
                
                Object.keys(p.dimensions).forEach(dimName => {
                    const dimTps = p.dimensions[dimName];
                    dimTps.forEach(tp => {
                        const foundVal = nilai.find(n => n.id_siswa === s.id && n.id_tp_koku === tp.id_tp_koku);
                        const val = foundVal ? foundVal.nilai : "";
                        const inputId = `koku-${s.id}-${tp.id_tp_koku}`;
                        
                        projectInputIds.push({ 
                            id: inputId, 
                            tpDesc: tp.deskripsi_tp, 
                            dimensi: dimName 
                        });

                        let optionsHtml = `<option value="" style="color:#ccc;">-</option>`;
                        P5_PREDIKATS.forEach(pred => {
                            const selected = val === pred.code ? 'selected' : '';
                            optionsHtml += `<option value="${pred.code}" ${selected} style="font-weight:bold; color:${pred.color}">${pred.code}</option>`;
                        });

                        bodyHtml += `<td style="padding:5px; text-align:center; border-right:1px solid #eee; border-bottom:1px solid #eee;">
                            <select id="${inputId}" class="form-control" 
                                style="width:100%; min-width:65px; text-align:center; font-size:12px; font-weight:700; cursor:pointer; padding:5px;"
                                onchange="saveNilaiTpKoku('${s.id}', '${tp.id_tp_koku}', this.value); generateKokuDesc('${s.id}', '${p.id_koku}')">
                                ${optionsHtml}
                            </select>
                        </td>`;
                    });
                });
                
                inputsDataPerSiswa[p.id_koku] = {
                    ids: projectInputIds,
                    namaKegiatan: p.kegiatan && p.kegiatan.trim() !== '' ? p.kegiatan : p.nama_projek
                };
            });

            projectStructure.forEach(p => {
                if(p.totalTps === 0) return;

                const pData = inputsDataPerSiswa[p.id_koku];
                const jsonInputs = JSON.stringify(pData.ids).replace(/"/g, '&quot;');
                const kegiatanSafe = pData.namaKegiatan.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

                bodyHtml += `<td style="
                    padding:10px; 
                    background:#FFFBEB; 
                    border-left:1px solid #FDE68A; 
                    border-bottom:1px solid #eee;
                    vertical-align:top; 
                    min-width: 250px; 
                    max-width: 350px;
                    white-space: normal !important;">
                    
                    <div id="desc-koku-${s.id}-${p.id_koku}" 
                         data-kegiatan="${kegiatanSafe}" 
                         data-inputs="${jsonInputs}"
                         style="font-size:11px; line-height:1.5; color:#334155; text-align:justify;">
                         <span style="color:#ccc;">Menghitung...</span>
                    </div>
                </td>`;
            });

            bodyHtml += `</tr>`;
        });

        tbody.innerHTML = bodyHtml;

        // --- STEP 4: TRIGGER KALKULASI ---
        setTimeout(() => {
            requestAnimationFrame(() => {
                siswa.forEach(s => {
                    projectStructure.forEach(p => { 
                        if(p.totalTps > 0) generateKokuDesc(s.id, p.id_koku); 
                    });
                });
            });
        }, 300);

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="20" style="color:red; text-align:center;">Gagal memuat: ${err.message}</td></tr>`;
    }
}

function generateKokuDesc(idSiswa, idKoku) {
    const descEl = document.getElementById(`desc-koku-${idSiswa}-${idKoku}`);
    if(!descEl) return;

    let inputsData;
    try {
        inputsData = JSON.parse(descEl.getAttribute('data-inputs'));
    } catch (e) {
        console.error("Gagal parse input data", e);
        descEl.textContent = "Error data";
        return;
    }

    const kegiatanName = descEl.getAttribute('data-kegiatan') || 'Projek ini'; 
    
    let bestItem = null; let bestWeight = -1;
    let worstItem = null; let worstWeight = 100;
    let hasData = false;

    // Loop data
    for (const item of inputsData) {
        const inputEl = document.getElementById(item.id);
        
        if (!inputEl) {
            return; 
        }

        const valCode = inputEl.value;
        
        if(valCode) {
            hasData = true;
            const pInfo = P5_PREDIKATS.find(p => p.code === valCode);
            const weight = pInfo ? pInfo.weight : 0;

            if(weight > bestWeight) { bestWeight = weight; bestItem = { ...item, ...pInfo }; }
            if(weight < worstWeight) { worstWeight = weight; worstItem = { ...item, ...pInfo }; }
        }
    }

    if(!hasData) { 
        descEl.innerHTML = "<span style='color:#ccc;'>- (Belum ada nilai)</span>"; 
        return; 
    }

    descEl.style.color = "#334155";
    const isFlat = bestWeight === worstWeight;

    let text = `Pada kegiatan <b>${kegiatanName}</b>, `;
    text += `Ananda <b style="color:${bestItem.color}">${bestItem.label}</b> dalam ${bestItem.tpDesc}`;
    
    if(!isFlat) {
        text += `, <b style="color:${worstItem.color}">${worstItem.label}</b> dalam ${worstItem.tpDesc}`;
    } else {
        text += ` secara konsisten pada semua aspek`;
    }
    
    text += ".";
    
    descEl.innerHTML = text;
}



// =======================================================
// MANAJEMEN JADWAL PELAJARAN
// =======================================================

async function initPageJadwal() {
    await loadJadwal();
}

async function loadJadwal() {
    const grid = document.querySelector('.jadwal-grid');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Memuat Jadwal...</div>';

    const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    try {
        const res = await fetch(`${API_URL}/jadwal-pelajaran?kelas=${currentUser.kelas}`);
        const data = await res.json();

        grid.innerHTML = '';

        days.forEach(day => {
            const dayItems = data.filter(d => d.hari === day);
            
            let itemsHtml = '';
            dayItems.forEach(item => {
                let bgStyle = 'background: white; border-left: 4px solid #3B82F6;'; 
                let icon = '<i class="fas fa-book" style="color:#3B82F6; font-size:10px;"></i>';
                
                if(item.tipe === 'Lainnya') {
                    bgStyle = 'background: #FFFBEB; border-left: 4px solid #F59E0B;'; 
                    icon = '<i class="fas fa-star" style="color:#F59E0B; font-size:10px;"></i>';
                    
                    if(item.nama_kegiatan === 'Upacara') icon = '<i class="fas fa-flag" style="color:#DC2626; font-size:10px;"></i>';
                    if(item.nama_kegiatan === 'Senam') icon = '<i class="fas fa-running" style="color:#10B981; font-size:10px;"></i>';
                    if(item.nama_kegiatan === 'Istirahat') { bgStyle = 'background: #F1F5F9; border-left: 4px solid #64748B;'; icon = '<i class="fas fa-mug-hot" style="color:#64748B; font-size:10px;"></i>'; }
                }

                itemsHtml += `
                    <div style="${bgStyle} padding: 10px; border-radius: 6px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; animation: fadeUp 0.3s;">
                        <div style="font-size: 13px; font-weight: 500; color: #334155;">
                            ${icon} <span style="margin-left:5px;">${item.nama_kegiatan}</span>
                        </div>
                        <button onclick="deleteJadwal(${item.id_jadwal})" style="border:none; background:none; color:#EF4444; cursor:pointer; font-size:12px;" title="Hapus"><i class="fas fa-times"></i></button>
                    </div>
                `;
            });

            grid.innerHTML += `
                <div class="jadwal-col" style="background: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="background: #3B82F6; color: white; padding: 10px; text-align: center; font-weight: bold; font-size: 14px;">
                        ${day}
                    </div>
                    <div style="padding: 10px; flex-grow: 1;">
                        ${itemsHtml}
                        <button onclick="openJadwalModal('${day}')" style="width: 100%; border: 2px dashed #CBD5E1; background: transparent; padding: 8px; border-radius: 8px; color: #64748B; font-size: 12px; cursor: pointer; transition: 0.3s;">
                            <i class="fas fa-plus"></i> Tambah
                        </button>
                    </div>
                </div>
            `;
        });

    } catch (err) {
        grid.innerHTML = `<div style="color:red;">Error: ${err.message}</div>`;
    }
}

// =======================================================
// MANAJEMEN JADWAL PIKET (NO DUPLICATE SISWA)
// =======================================================

async function initPagePiket() {
    await loadPiket();
}

async function loadPiket() {
    const grid = document.querySelector('.piket-grid');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Memuat Jadwal Piket...</div>';

    const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    try {
        const res = await fetch(`${API_URL}/jadwal-piket?kelas=${currentUser.kelas}`);
        const data = await res.json();

        grid.innerHTML = '';

        days.forEach(day => {
            const dayItems = data.filter(d => d.hari === day);
            
            let itemsHtml = '';
            dayItems.forEach(item => {
                itemsHtml += `
                    <div style="background: white; border-left: 4px solid #10B981; padding: 10px; border-radius: 6px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; animation: fadeUp 0.3s;">
                        <div style="font-size: 13px; font-weight: 500; color: #334155;">
                            <i class="fas fa-user" style="color:#10B981; font-size:10px;"></i> <span style="margin-left:5px;">${item.nama}</span>
                        </div>
                        <button onclick="deletePiket(${item.id_piket})" style="border:none; background:none; color:#EF4444; cursor:pointer; font-size:12px;" title="Hapus"><i class="fas fa-times"></i></button>
                    </div>
                `;
            });

            grid.innerHTML += `
                <div class="piket-col" style="background: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="background: #059669; color: white; padding: 10px; text-align: center; font-weight: bold; font-size: 14px;">
                        ${day}
                    </div>
                    <div style="padding: 10px; flex-grow: 1;">
                        ${itemsHtml}
                        <button onclick="openPiketModal('${day}')" style="width: 100%; border: 2px dashed #CBD5E1; background: transparent; padding: 8px; border-radius: 8px; color: #64748B; font-size: 12px; cursor: pointer; transition: 0.3s;">
                            <i class="fas fa-plus"></i> Tambah Petugas
                        </button>
                    </div>
                </div>
            `;
        });

    } catch (err) {
        grid.innerHTML = `<div style="color:red;">Error: ${err.message}</div>`;
    }
}

async function openPiketModal(day) {
    document.getElementById('piketHariInput').value = day;
    document.getElementById('piketHariTitle').innerText = day;
    
    const sel = document.getElementById('piketSiswaSelect');
    sel.innerHTML = '<option>Memuat data...</option>';
    
    openModal('piketModal');

    try {
        // 1. Ambil Semua Siswa di Kelas
        const resSiswa = await fetch(`${API_URL}/siswa`);
        const allSiswa = await resSiswa.json();
        const classSiswa = allSiswa.filter(s => s.kelas === currentUser.kelas);

        // 2. Ambil Data Piket yang SUDAH ADA (Untuk di-exclude)
        const resPiket = await fetch(`${API_URL}/jadwal-piket?kelas=${currentUser.kelas}`);
        const existingPiket = await resPiket.json();
        const assignedSiswaIds = existingPiket.map(p => p.id_siswa);

        // 3. Filter: Hanya tampilkan siswa yang BELUM ada di jadwal piket manapun
        const availableSiswa = classSiswa.filter(s => !assignedSiswaIds.includes(s.id));

        sel.innerHTML = '<option value="">- Pilih Siswa -</option>';
        if(availableSiswa.length === 0) {
            sel.innerHTML = '<option value="">Semua siswa sudah mendapat jadwal.</option>';
        } else {
            // Sortir nama agar rapi
            availableSiswa.sort((a,b) => a.nama.localeCompare(b.nama));
            
            availableSiswa.forEach(s => {
                sel.innerHTML += `<option value="${s.id}">${s.nama}</option>`;
            });
        }

    } catch(e) {
        sel.innerHTML = '<option>Error loading data</option>';
        console.error(e);
    }
}

document.getElementById('piketForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const hari = document.getElementById('piketHariInput').value;
    const idSiswa = document.getElementById('piketSiswaSelect').value;

    if (!idSiswa) {
        alert("Silakan pilih siswa.");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/jadwal-piket`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                kelas: currentUser.kelas,
                hari: hari,
                id_siswa: idSiswa
            })
        });

        const data = await res.json();

        if(!res.ok) throw new Error(data.error || "Gagal menyimpan");
        
        closeModal('piketModal');
        loadPiket(); // Refresh Grid

    } catch (err) {
        alert(err.message);
    }
});

function deletePiket(id) {
    if(!confirm("Hapus siswa ini dari jadwal piket?")) return;
    
    fetch(`${API_URL}/jadwal-piket/${id}`, { method: 'DELETE' })
        .then(res => {
            if(res.ok) loadPiket();
            else alert("Gagal menghapus");
        })
        .catch(err => alert(err.message));
}

// Buka Modal & Load Mapel untuk Dropdown
async function openJadwalModal(day) {
    document.getElementById('jadwalHariInput').value = day;
    document.getElementById('jadwalHariTitle').innerText = day;
    
    document.getElementById('jadwalTipe').value = 'Mapel';
    toggleJadwalInput();

    const mapelSelect = document.getElementById('jadwalMapelSelect');
    mapelSelect.innerHTML = '<option>Loading...</option>';

    try {
        const res = await fetch(`${API_URL}/mata-pelajaran`);
        const data = await res.json();
        
        mapelSelect.innerHTML = '';
        if(data.length === 0) {
            mapelSelect.innerHTML = '<option value="">Belum ada Mapel</option>';
        } else {
            data.forEach(m => {
                mapelSelect.innerHTML += `<option value="${m.nama_mapel}">${m.nama_mapel}</option>`;
            });
        }
    } catch(e) {
        mapelSelect.innerHTML = '<option>Error loading mapel</option>';
    }

    openModal('jadwalModal');
}

function toggleJadwalInput() {
    const tipe = document.getElementById('jadwalTipe').value;
    if (tipe === 'Mapel') {
        document.getElementById('group-mapel').style.display = 'block';
        document.getElementById('group-lainnya').style.display = 'none';
    } else {
        document.getElementById('group-mapel').style.display = 'none';
        document.getElementById('group-lainnya').style.display = 'block';
    }
}

// Simpan Jadwal
document.getElementById('jadwalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const hari = document.getElementById('jadwalHariInput').value;
    const tipe = document.getElementById('jadwalTipe').value;
    let namaKegiatan = '';

    if (tipe === 'Mapel') {
        namaKegiatan = document.getElementById('jadwalMapelSelect').value;
    } else {
        namaKegiatan = document.getElementById('jadwalLainnyaSelect').value;
    }

    if (!namaKegiatan) {
        alert("Silakan pilih Mata Pelajaran atau Kegiatan.");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/jadwal-pelajaran`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                kelas: currentUser.kelas,
                hari: hari,
                nama_kegiatan: namaKegiatan,
                tipe: tipe
            })
        });

        if(!res.ok) throw new Error("Gagal menyimpan");
        
        closeModal('jadwalModal');
        loadJadwal(); // Refresh Grid

    } catch (err) {
        alert(err.message);
    }
});

function deleteJadwal(id) {
    if(!confirm("Hapus item jadwal ini?")) return;
    
    fetch(`${API_URL}/jadwal-pelajaran/${id}`, { method: 'DELETE' })
        .then(res => {
            if(res.ok) loadJadwal();
            else alert("Gagal menghapus");
        })
        .catch(err => alert(err.message));
}


// =======================================================
// 7. DATA LAPORAN & CHART
// =======================================================
async function loadLaporanData() {
    const tbody = document.querySelector("#laporanTable tbody");
    tbody.innerHTML = '<tr><td colspan="20" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Memuat Data...</td></tr>';
    try {
        const res = await fetch(`${API_URL}/laporan?kelas=${currentUser.kelas}`);
        const laporanData = await res.json();
        
        rawLaporanData = laporanData.map(d => ({
            ...d,
            namaSiswa: d.nama_siswa,
            tanggalKegiatan: d.tanggal_kegiatan,
            bangunPagi: d.bangun_pagi,
            tidurCepat: d.tidur_cepat,
            rincianOlahraga: d.rincian_olahraga,
            tempatBelajar: d.tempat_belajar,
            materiBelajar: d.materi_belajar,
            kegiatanMasyarakat: d.kegiatan_masyarakat,
            makananKarbo: d.makanan_karbo,
            makananSayur: d.makanan_sayur,
            makananSusu: d.makanan_susu,
            makananLauk: d.makanan_lauk,
            makananAir: d.makanan_air
        }));

        const headers = ["ID", "Nama Siswa", "Tanggal", "I1", "I2", "I3", "I4", "I5", "I6", "I7", "Pagi", "Tidur", "Olahraga", "Belajar", "Materi", "Masyarakat", "Karbo", "Sayur", "Susu", "Protein", "Air"];
        const dataArray = [headers];
        laporanData.forEach(d => {
            dataArray.push([d.id, d.nama_siswa, d.tanggal_kegiatan, d.ibadah1||'', d.ibadah2||'', d.ibadah3||'', d.ibadah4||'', d.ibadah5||'', d.ibadah6||'', d.ibadah7||'', d.bangun_pagi?d.bangun_pagi.substring(0,5):'', d.tidur_cepat?d.tidur_cepat.substring(0,5):'', d.rincian_olahraga||'', d.tempat_belajar||'', d.materi_belajar||'', d.kegiatan_masyarakat||'', d.makanan_karbo?'Ya':'', d.makanan_sayur?'Ya':'', d.makanan_susu?'Ya':'', d.makanan_lauk?'Ya':'', d.makanan_air?'Ya':'']);
        });
        fullData = dataArray;
        applyDateFilter();
    } catch (err) { tbody.innerHTML = `<tr><td colspan="20" style="color:red; text-align:center;">Gagal memuat: ${err.message}</td></tr>`; }
}

function applyDateFilter() {
    const startDate = document.getElementById('rep-startDate').value;
    const endDate = document.getElementById('rep-endDate').value;
    
    if (!fullData || fullData.length === 0) return;

    if (!startDate || !endDate) filteredData = [...fullData];
    else {
        const start = new Date(startDate); const end = new Date(endDate);
        const dataRows = fullData.slice(1);
        const result = dataRows.filter(row => { const rowDate = new Date(row[2]); return rowDate >= start && rowDate <= end; });
        filteredData = [fullData[0], ...result];
    }
    populateLaporanTable(activeLaporanView);
    if (activeLaporanView === 'grafik') renderGuruGlobalChart();
    if (activeLaporanView === 'analisis') renderGuruAnalisis();
}

function switchLaporanView(view) {
    activeLaporanView = view;
    const btnPdf = document.getElementById('btnDownloadRekap'); 
    if(btnPdf) btnPdf.style.display = (view === 'rekap' || view === 'predikat') ? 'inline-flex' : 'none';

    const tableContainer = document.getElementById('laporan-table-container');
    const grafikContainer = document.getElementById('grafik-view');
    const analisisContainer = document.getElementById('analisis-view');

    tableContainer.style.display = 'none'; grafikContainer.style.display = 'none'; analisisContainer.style.display = 'none';

    if (view === 'grafik') { grafikContainer.style.display = 'block'; renderGuruGlobalChart(); }
    else if (view === 'analisis') { analisisContainer.style.display = 'block'; renderGuruAnalisis(); }
    else { tableContainer.style.display = 'block'; populateLaporanTable(view); }
}

function processGuruClassData() {
    const { ibadahSettings = [], waktu = {}, predikat = {} } = globalSettings;
    const ibadahThreshold = ibadahSettings.filter(s => s).length;
    const bbp = waktu.bangunPagi || '05:00'; const btc = waktu.tidurCepat || '21:00';
    
    let processedData = rawLaporanData;
    const startDate = document.getElementById('rep-startDate').value;
    const endDate = document.getElementById('rep-endDate').value;
    if (startDate && endDate) {
        const start = new Date(startDate); const end = new Date(endDate);
        processedData = rawLaporanData.filter(d => { const rowDate = new Date(d.tanggalKegiatan); return rowDate >= start && rowDate <= end; });
    }

    const studentRekap = {};
    processedData.forEach(d => {
        if (!d.namaSiswa) return;
        const key = d.namaSiswa; 
        if (!studentRekap[key]) studentRekap[key] = { totalHari: 0, beribadah: 0, tidurCepat: 0, bangunPagi: 0, olahraga: 0, belajar: 0, bermasyarakat: 0, makanBergizi: 0 };
        const data = studentRekap[key]; data.totalHari++; 
        
        let ibadahPoint = 0;
        for(let j=0; j<7; j++) { if(ibadahSettings[j] && String(d[`ibadah${j+1}`]||'').trim()) ibadahPoint++; }
        if(ibadahThreshold > 0 && ibadahPoint >= ibadahThreshold) data.beribadah++;
        
        if (d.bangunPagi && d.bangunPagi <= bbp) data.bangunPagi++; 
        if (d.tidurCepat && d.tidurCepat <= btc) data.tidurCepat++;
        if (String(d.rincianOlahraga || '').trim()) data.olahraga++; 
        if (String(d.tempatBelajar || '').trim() && String(d.materiBelajar || '').trim()) data.belajar++;
        if (String(d.kegiatanMasyarakat || '').trim()) data.bermasyarakat++; 
        if (d.makananKarbo && d.makananSayur && d.makananSusu && d.makananLauk && d.makananAir) data.makanBergizi++;
    });

    const rekap = { beribadah: {}, tidurCepat: {}, bangunPagi: {}, olahraga: {}, belajar: {}, bermasyarakat: {}, makanBergizi: {} };
    const keys = ["beribadah", "tidurCepat", "bangunPagi", "olahraga", "belajar", "bermasyarakat", "makanBergizi"];
    
    Object.values(studentRekap).forEach(data => {
        keys.forEach(catKey => {
            let p_text = predikat.kurangText || 'Perlu Peningkatan';
            if (data.totalHari > 0) { 
                const prob = (data[catKey] / data.totalHari) * 100;
                if (prob >= (predikat.taatValue || 85)) { p_text = predikat.taatText || 'Anak Hebat'; }
                else if (prob >= (predikat.terbiasaValue || 70)) { p_text = predikat.terbiasaText || 'Terbiasa'; }
            }
            rekap[catKey][p_text] = (rekap[catKey][p_text] || 0) + 1;
        });
    });
    return { rekap, processedData };
}

function renderGuruGlobalChart() {
    const { rekap } = processGuruClassData();
    const { predikat = {} } = globalSettings; 
    const t = predikat.taatText || 'Anak Hebat'; const b = predikat.terbiasaText || 'Terbiasa'; const k = predikat.kurangText || 'Perlu Peningkatan';
    const labels = ["Beribadah", "Tidur Cepat", "Bangun Pagi", "Olahraga", "Belajar", "Bermasyarakat", "Makan Bergizi"];
    const keys = ["beribadah", "tidurCepat", "bangunPagi", "olahraga", "belajar", "bermasyarakat", "makanBergizi"];
    const tData = [], bData = [], kData = [];
    
    keys.forEach(key => { 
        tData.push(rekap[key][t] || 0); 
        bData.push(rekap[key][b] || 0); 
        kData.push(rekap[key][k] || 0); 
    });

    const ctx = document.getElementById('guruGlobalChart').getContext('2d');
    if (chartInstances.global) chartInstances.global.destroy();
    chartInstances.global = new Chart(ctx, { 
        type: 'bar', 
        data: { labels: labels, datasets: [{ label: t, data: tData, backgroundColor: 'rgba(22, 163, 74, 0.7)' }, { label: b, data: bData, backgroundColor: 'rgba(245, 158, 11, 0.7)' }, { label: k, data: kData, backgroundColor: 'rgba(239, 68, 68, 0.7)' }] }, 
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } 
    });
}

function renderGuruAnalisis() {
    const { processedData: laporanData } = processGuruClassData();
    const { ibadahSettings, ibadahOptions, waktu = {} } = globalSettings;
    const container = document.getElementById('analisis-ibadah-rinci-container'); container.innerHTML = '';

    for (let i = 1; i <= 7; i++) {
        if (!ibadahSettings || !ibadahSettings[i - 1]) continue;
        const ibadahKey = `ibadah${i}`; const options = (ibadahOptions && ibadahOptions[ibadahKey]) ? ibadahOptions[ibadahKey] : [];
        const counts = {}; options.forEach(opt => counts[opt] = 0); let tidakMelaksanakan = 0;
        laporanData.forEach(l => { const v = l[ibadahKey]; if (v && options.includes(v)) { counts[v]++; } else { tidakMelaksanakan++; } });
        const chartLabels = []; const chartData = []; 
        for (const option in counts) { if (counts[option] > 0) { chartLabels.push(option); chartData.push(counts[option]); } }
        if (tidakMelaksanakan > 0) { chartLabels.push('Tidak Melaksanakan'); chartData.push(tidakMelaksanakan); }
        if (chartData.length === 0) continue;
        const wrapper = document.createElement('div'); wrapper.className = 'chart-wrapper'; wrapper.innerHTML = `<div class="chart-title">Detail Ibadah ${i}</div>`;
        const canvas = document.createElement('canvas'); wrapper.appendChild(canvas); container.appendChild(wrapper);
        new Chart(canvas.getContext('2d'), { type: 'doughnut', data: { labels: chartLabels, datasets: [{ data: chartData, borderWidth: 1 }] } });
    }

    const bbp = waktu.bangunPagi || '05:00'; let bpt = 0; laporanData.forEach(l => { if (l.bangunPagi && l.bangunPagi <= bbp) bpt++; });
    renderChart('guruBangunChart', 'pie', ['Tepat Waktu', 'Terlambat'], [bpt, laporanData.length - bpt], ['#2ECC71', '#E74C3C']);
    
    const btc = waktu.tidurCepat || '21:00'; let tct = 0; laporanData.forEach(l => { if (l.tidurCepat && l.tidurCepat <= btc) tct++; });
    renderChart('guruTidurChart', 'pie', ['Tepat Waktu', 'Terlambat'], [tct, laporanData.length - tct], ['#3498DB', '#E74C3C']);

    let olg = 0; laporanData.forEach(l => { if (l.rincianOlahraga && l.rincianOlahraga.trim()) olg++; });
    renderChart('guruOlahragaChart', 'doughnut', ['Melakukan', 'Tidak'], [olg, laporanData.length - olg], ['#F1C40F', '#95A5A6']);

    let masy = 0; laporanData.forEach(l => { if (l.kegiatanMasyarakat && l.kegiatanMasyarakat.trim()) masy++; });
    renderChart('guruMasyarakatChart', 'doughnut', ['Melakukan', 'Tidak'], [masy, laporanData.length - masy], ['#9B59B6', '#95A5A6']);

    let bel = 0; laporanData.forEach(l => { if ((l.tempatBelajar && l.tempatBelajar.trim()) || (l.materiBelajar && l.materiBelajar.trim())) bel++; });
    renderChart('guruBelajarChart', 'doughnut', ['Belajar', 'Tidak'], [bel, laporanData.length - bel], ['#34495E', '#95A5A6']);

    let mCounts = { Karbo: 0, Sayur: 0, Susu: 0, Lauk: 0, Air: 0 };
    laporanData.forEach(l => { if (l.makananKarbo) mCounts.Karbo++; if (l.makananSayur) mCounts.Sayur++; if (l.makananSusu) mCounts.Susu++; if (l.makananLauk) mCounts.Lauk++; if (l.makananAir) mCounts.Air++; });
    const ctxMakan = document.getElementById('guruMakananChart').getContext('2d'); if (chartInstances['guruMakananChart']) chartInstances['guruMakananChart'].destroy();
    chartInstances['guruMakananChart'] = new Chart(ctxMakan, { type: 'bar', data: { labels: Object.keys(mCounts), datasets: [{ label: 'Jumlah Siswa', data: Object.values(mCounts), backgroundColor: ['#e67e22', '#2ecc71', '#ecf0f1', '#e74c3c', '#3498db'], borderWidth: 1 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false } });
}

function renderChart(id, type, labels, data, colors) {
    const canvas = document.getElementById(id);
    if (!canvas) return; // Guard
    const ctx = canvas.getContext('2d');
    if (chartInstances[id]) chartInstances[id].destroy();
    chartInstances[id] = new Chart(ctx, { type: type, data: { labels: labels, datasets: [{ label: 'Jumlah', data: data, backgroundColor: colors }] }, options: { responsive: true, maintainAspectRatio: false } });
}

// =======================================================
// 8. RENDER FORMS (DATA SEKOLAH, PENGATURAN, GALERI)
// =======================================================
function renderSekolahForms() {
    const info = globalSettings.infoSekolah || {};
    const vm = info.visiMisi || globalSettings.visiMisi || {};
    const sosmed = info.socialMedia || {}; 
    
    document.getElementById('sekolahForm').innerHTML = `
        <div class="school-logo-preview-container">
            <img src="${resolveImg(info.logo)}" class="school-logo-preview" id="preview-logo-sekolah">
            <div style="font-size: 12px; color: #64748B; margin-bottom: 10px;">Logo Sekolah</div>
            <button type="button" class="btn btn-info btn-sm" onclick="document.getElementById('f-logo').click()" style="width: 100%; justify-content: center;"><i class="fas fa-upload"></i> Upload Logo</button>
            <input type="file" id="f-logo" style="display:none" onchange="handleFileUpload(this, 'sk-logo');">
            <input type="hidden" id="sk-logo" value="${info.logo||''}">
        </div>
        <div class="school-form-fields">
            <div class="form-group full-width"><label>Nama Sekolah</label><input type="text" id="sk-nama" value="${info.namaSekolah||''}"></div>
            <div class="form-group"><label>NPSN</label><input type="text" id="sk-npsn" value="${info.npsn||''}"></div>
            <div class="form-group"><label>Alamat Lengkap</label><input type="text" id="sk-alamat" value="${info.alamat||''}"></div>
            <div class="settings-section-title">Kepala Sekolah</div>
            <div class="form-group"><label>Nama Kepsek</label><input type="text" id="sk-kepsek" value="${info.namaKepsek||''}"></div>
            <div class="form-group"><label>NIP Kepsek</label><input type="text" id="sk-nip" value="${info.nipKepsek||''}"></div>
            <div class="form-group full-width"><label>Tempat (TTD)</label><input type="text" id="sk-tempat" value="${info.namaTempat||''}"></div>
            <div class="settings-section-title">Media Sosial</div>
            <div class="form-group"><label>Facebook</label><input type="text" id="sk-fb" value="${sosmed.facebook||''}"></div>
            <div class="form-group"><label>Instagram</label><input type="text" id="sk-ig" value="${sosmed.instagram||''}"></div>
            <div class="form-group"><label>YouTube</label><input type="text" id="sk-yt" value="${sosmed.youtube||''}"></div>
            <div class="form-group"><label>WhatsApp</label><input type="text" id="sk-wa" value="${sosmed.whatsapp||''}"></div>
        </div>`;
    document.getElementById('infoForm').innerHTML = `
        <div class="form-group full-width"><label>Visi</label><textarea id="sk-visi" rows="3">${vm.visi||''}</textarea></div>
        <div class="form-group full-width"><label>Misi</label><textarea id="sk-misi" rows="5">${vm.misi||''}</textarea></div>
        <div class="form-group full-width"><label>Tujuan</label><textarea id="sk-tujuan" rows="4">${vm.tujuan||''}</textarea></div>
        <div class="form-group full-width"><label>Kata Sambutan Guru</label><textarea id="sk-sambutan" rows="4">${info.sambutanKepsek||''}</textarea></div>`;
}

async function saveSekolahData() {
    if(!globalSettings.infoSekolah) globalSettings.infoSekolah = {};
    const i = globalSettings.infoSekolah;
    i.namaSekolah = document.getElementById('sk-nama').value; i.npsn = document.getElementById('sk-npsn').value; 
    i.namaKepsek = document.getElementById('sk-kepsek').value; i.nipKepsek = document.getElementById('sk-nip').value; 
    i.alamat = document.getElementById('sk-alamat').value; i.logo = document.getElementById('sk-logo').value; 
    i.namaTempat = document.getElementById('sk-tempat').value; i.sambutanKepsek = document.getElementById('sk-sambutan').value;
    i.visiMisi = { visi: document.getElementById('sk-visi').value, misi: document.getElementById('sk-misi').value, tujuan: document.getElementById('sk-tujuan').value };
    i.socialMedia = { facebook: document.getElementById('sk-fb').value, instagram: document.getElementById('sk-ig').value, youtube: document.getElementById('sk-yt').value, whatsapp: document.getElementById('sk-wa').value };
    
    await fetch(`${API_URL}/pengaturan`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ data: globalSettings }) });
    showModal("Data Sekolah Tersimpan!", "Sukses");
    document.getElementById('favicon').href = resolveImg(i.logo);
}

function renderPengaturanForms() {
    const ibS = globalSettings.ibadahSettings || [false, false, false, false, false, false, false];
    const ibO = globalSettings.ibadahOptions || {};
    const pr = globalSettings.predikat || {};
    const wk = globalSettings.waktu || {};
    
    let html = `<div class="settings-section-title"><i class="fas fa-praying-hands"></i> Konfigurasi Ibadah</div><div class="ibadah-card-grid">`;
    for(let i=1; i<=7; i++) {
        const isActive = ibS[i-1];
        html += `<div class="ibadah-card ${isActive ? 'active' : ''}"><div class="ibadah-header"><div class="ibadah-title"><div class="ibadah-icon">${i}</div>Ibadah ${i}</div><label class="toggle-switch"><input type="checkbox" id="ib-check-${i}" ${isActive ? 'checked' : ''} onchange="this.closest('.ibadah-card').classList.toggle('active')"><span class="slider"></span></label></div><div class="form-group" style="margin-bottom:0"><label style="font-size:11px;">Opsi Pilihan (Pisahkan dengan baris baru)</label><textarea id="ib-opt-${i}" rows="3" style="font-size:12px; height:80px;">${(ibO['ibadah'+i]||[]).join('\n')}</textarea></div></div>`;
    }
    html += `</div><div class="settings-section-title" style="margin-top:40px;"><i class="fas fa-clock"></i> Batas Waktu & Predikat</div><div class="form-grid" style="grid-template-columns: 1fr 1fr;"><div class="card" style="margin:0; background:#F8FAFC; border:1px solid #E2E8F0;"><div class="form-group"><label>Batas Bangun Pagi</label><input type="time" id="wk-bangun" value="${wk.bangunPagi||'05:00'}"></div></div><div class="card" style="margin:0; background:#F8FAFC; border:1px solid #E2E8F0;"><div class="form-group"><label>Batas Tidur Malam</label><input type="time" id="wk-tidur" value="${wk.tidurCepat||'21:00'}"></div></div></div><div class="predikat-grid">
        <div class="predikat-card taat"><div class="predikat-icon"><i class="fas fa-award"></i></div><div class="input-group-animate"><label class="predikat-label" style="color:white">Target Minimal (%)</label><input type="number" id="pr-t-val" class="predikat-input" placeholder="0-100" value="${pr.taatValue||90}"></div><div class="input-group-animate"><label class="predikat-label" style="color:white">Sebutan Predikat</label><input type="text" id="pr-t-text" class="predikat-input" placeholder="Contoh: Hebat" value="${pr.taatText||'Anak Hebat'}"></div></div>
        <div class="predikat-card terbiasa"><div class="predikat-icon"><i class="fas fa-star-half-alt"></i></div><div class="input-group-animate"><label class="predikat-label" style="color:white">Target Minimal (%)</label><input type="number" id="pr-b-val" class="predikat-input" placeholder="0-100" value="${pr.terbiasaValue||50}"></div><div class="input-group-animate"><label class="predikat-label" style="color:white">Sebutan Predikat</label><input type="text" id="pr-b-text" class="predikat-input" placeholder="Contoh: Biasa" value="${pr.terbiasaText||'Terbiasa'}"></div></div>
        <div class="predikat-card kurang"><div class="predikat-icon"><i class="fas fa-exclamation-circle"></i></div><div class="input-group-animate" style="opacity: 0.7;"><label class="predikat-label" style="color:white">Target Minimal</label><div style="height: 48px; display:flex; align-items:center; justify-content:center; border: 2px dashed rgba(255,255,255,0.3); border-radius: 12px; font-weight:600;">Otomatis (< Nilai Sedang)</div></div><div class="input-group-animate"><label class="predikat-label" style="color:white">Sebutan Predikat</label><input type="text" id="pr-k-text" class="predikat-input" placeholder="Contoh: Kurang" value="${pr.kurangText||'Kurang'}"></div></div></div>`;
    document.getElementById('pengaturan-container').innerHTML = html;
}

async function saveGlobalSettings() {
     const ibS = []; const ibO = {};
     for(let i=1; i<=7; i++) { ibS.push(document.getElementById(`ib-check-${i}`).checked); ibO['ibadah'+i] = document.getElementById(`ib-opt-${i}`).value.split('\n').filter(v=>v.trim()); }
     globalSettings.ibadahSettings = ibS; globalSettings.ibadahOptions = ibO;
     globalSettings.waktu = { bangunPagi: document.getElementById('wk-bangun').value, tidurCepat: document.getElementById('wk-tidur').value };
     globalSettings.predikat = { taatText: document.getElementById('pr-t-text').value, taatValue: document.getElementById('pr-t-val').value, terbiasaText: document.getElementById('pr-b-text').value, terbiasaValue: document.getElementById('pr-b-val').value, kurangText: document.getElementById('pr-k-text').value };
     
     await fetch(`${API_URL}/pengaturan`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ data: globalSettings }) });
     showModal("Pengaturan Tersimpan!", "Sukses");
}

function renderGaleriForms() {
    const gal = globalSettings.infoSekolah?.galeri || Array(10).fill("");
    const yt = globalSettings.infoSekolah?.youtubeLinks || ["","",""];
    let gHtml = '';
    for(let i=1; i<=10; i++) {
        gHtml += `<div class="card" style="padding:15px; margin:0; text-align:center;"><img src="${resolveImg(gal[i-1])}" id="prev-gal-${i}" class="gallery-preview"><div style="display:flex;gap:5px"><input type="text" id="gal-url-${i}" value="${gal[i-1]||''}" onchange="document.getElementById('prev-gal-${i}').src=resolveImg(this.value)" placeholder="URL Gambar"><button class="btn btn-info" onclick="document.getElementById('f-gal-${i}').click()"><i class="fas fa-upload"></i></button><input type="file" id="f-gal-${i}" style="display:none" onchange="handleFileUpload(this, 'gal-url-${i}')"></div></div>`;
    }
    document.getElementById('galeri-list').innerHTML = gHtml;
    document.getElementById('youtube-list').innerHTML = yt.map((u, idx) => `<div class="form-group"><label>Link YouTube ${idx+1}</label><input type="text" id="yt-url-${idx}" value="${u}" placeholder="https://youtube.com/..."></div>`).join('');
}

async function saveGaleri() {
    const gal = []; for(let i=1; i<=10; i++) gal.push(document.getElementById(`gal-url-${i}`).value);
    const yt = []; for(let i=0; i<3; i++) yt.push(document.getElementById(`yt-url-${i}`).value);
    if(!globalSettings.infoSekolah) globalSettings.infoSekolah = {};
    globalSettings.infoSekolah.galeri = gal; globalSettings.infoSekolah.youtubeLinks = yt;
    await fetch(`${API_URL}/pengaturan`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ data: globalSettings }) });
    showModal("Media Galeri & YouTube Berhasil Disimpan!", "Sukses");
}

function renderKelasVisualForm() {
    const ik = globalSettings.infoSekolah?.infoKelas || {};
    const pengumumanData = globalSettings.infoSekolah?.pengumuman || globalSettings.pengumuman || {};
    const form = document.getElementById('kelasVisualForm');
    
    let pengumumanFormHtml = `<div class="settings-section-title" style="margin-bottom: 20px;"><i class="fas fa-bullhorn"></i> Kelola Pengumuman Sekolah</div>`;
    
    for(let i=1; i<=3; i++) {
        const p = pengumumanData[`pengumuman${i}`] || {};
        pengumumanFormHtml += `
        <div class="card" style="border: 1px solid #E2E8F0; padding: 20px; margin-bottom: 20px; background-color: #F8FAFC;">
            <h3 style="margin-bottom: 15px; font-size: 16px;">Pengumuman ${i}</h3>
            <div class="form-grid" style="grid-template-columns: 1fr;">
                <div class="form-group"><label>Judul Pengumuman</label><input type="text" id="pengumuman-judul-${i}" value="${p[`pengumuman${i}Judul`] || ''}" placeholder="Contoh: Libur Nasional"></div>
                <div class="form-group"><label>URL Gambar (Opsional)</label><div style="display: flex; gap: 10px; align-items: center;"><input type="text" id="pengumuman-gambar-${i}" value="${p[`pengumuman${i}Gambar`] || ''}" placeholder="URL Gambar"><button type="button" class="btn btn-info" onclick="document.getElementById('f-pengumuman-${i}').click()"><i class="fas fa-folder-open"></i></button><input type="file" id="f-pengumuman-${i}" style="display:none" onchange="handleFileUpload(this, 'pengumuman-gambar-${i}')"></div></div>
                <div class="form-group"><label>URL Dokumen/Link (Opsional)</label><input type="text" id="pengumuman-dokumen-${i}" value="${p[`pengumuman${i}Dokumen`] || ''}" placeholder="Link G-Drive/Website"></div>
                <div class="form-group full-width"><label>Isi Pengumuman</label><textarea id="pengumuman-text-${i}" rows="3" placeholder="Tulis isi pengumuman disini...">${p[`pengumuman${i}Text`] || ''}</textarea></div>
            </div>
        </div>`;
    }

    let visualKelasHtml = `
        <div class="settings-section-title" style="margin: 30px 0 20px;"><i class="fas fa-chalkboard"></i> Info Visual Kelas</div>
        <div class="form-group full-width"><label>Jadwal Pelajaran (URL Gambar)</label><div style="display:flex;gap:10px"><input type="text" id="iv-jadwal" value="${ik.jadwalPelajaran||''}"><button type="button" class="btn btn-info" onclick="document.getElementById('f-iv-j').click()"><i class="fas fa-folder-open"></i></button><input type="file" id="f-iv-j" style="display:none" onchange="handleFileUpload(this, 'iv-jadwal')"></div></div>
        <div class="form-group full-width"><label>Struktur Organisasi (URL Gambar)</label><div style="display:flex;gap:10px"><input type="text" id="iv-struktur" value="${ik.strukturOrganisasi||''}"><button type="button" class="btn btn-info" onclick="document.getElementById('f-iv-s').click()"><i class="fas fa-folder-open"></i></button><input type="file" id="f-iv-s" style="display:none" onchange="handleFileUpload(this, 'iv-struktur')"></div></div>
        <div class="form-group full-width"><label>Kesepakatan Kelas (URL Gambar)</label><div style="display:flex;gap:10px"><input type="text" id="iv-kesepakatan" value="${ik.kesepakatanKelas||''}"><button type="button" class="btn btn-info" onclick="document.getElementById('f-iv-k').click()"><i class="fas fa-folder-open"></i></button><input type="file" id="f-iv-k" style="display:none" onchange="handleFileUpload(this, 'iv-kesepakatan')"></div></div>
    `;
    form.innerHTML = pengumumanFormHtml + visualKelasHtml;
}

async function saveKelasVisual() {
    if(!globalSettings.infoSekolah) globalSettings.infoSekolah = {};
    const pengumuman = {};
    for(let i=1; i<=3; i++) {
        pengumuman[`pengumuman${i}`] = {
            [`pengumuman${i}Judul`]: document.getElementById(`pengumuman-judul-${i}`).value,
            [`pengumuman${i}Gambar`]: document.getElementById(`pengumuman-gambar-${i}`).value,
            [`pengumuman${i}Dokumen`]: document.getElementById(`pengumuman-dokumen-${i}`).value,
            [`pengumuman${i}Text`]: document.getElementById(`pengumuman-text-${i}`).value
        };
    }
    globalSettings.infoSekolah.pengumuman = pengumuman;
    globalSettings.infoSekolah.infoKelas = {
        jadwalPelajaran: document.getElementById('iv-jadwal').value,
        strukturOrganisasi: document.getElementById('iv-struktur').value,
        kesepakatanKelas: document.getElementById('iv-kesepakatan').value
    };
    
    await fetch(`${API_URL}/pengaturan`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ data: globalSettings }) });
    showModal("Informasi Kelas & Pengumuman berhasil disimpan!", "Sukses");
}

// =======================================================
// 9. SISWA, UPLOAD, EXCEL
// =======================================================
async function loadSiswaData() {
    const tbody = document.querySelector("#siswaTable tbody"); 
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Memuat Data...</td></tr>';
    
    try {
        const res = await fetch(`${API_URL}/siswa`); 
        const all = await res.json();
        // Simpan data ke variabel global
        cachedSiswaList = all.filter(s => s.kelas === currentUser.kelas).sort((a,b) => a.nama.localeCompare(b.nama));
        
        // Render tabel pertama kali
        renderSiswaTable(cachedSiswaList);
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error: ${err.message}</td></tr>`;
    }
}

function renderSiswaTable(data) {
    const tbody = document.querySelector("#siswaTable tbody"); 
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94A3B8;">Data tidak ditemukan</td></tr>';
        return;
    }

    data.forEach(s => {
        // Kita menggunakan onclick inline dengan ID. 
        // Ini AMAN untuk filter, karena ID tetap menempel pada tombol meskipun baris dibuat ulang.
        tbody.innerHTML += `
            <tr>
                <td><img src="${resolveImg(s.foto)}" style="width:35px;height:35px;border-radius:50%;object-fit:cover;border:1px solid #ddd"></td>
                <td style="font-weight:600;">${s.nama}</td>
                <td>${s.nomor_induk}</td>
                <td>${s.jenis_kelamin || '-'}</td>
                <td>${s.agama}</td>
                <td>
                    <button class="action-btn edit" onclick="openSiswaModal('${s.id}')" title="Edit"><i class="fas fa-edit"></i></button> 
                    <button class="action-btn delete" onclick="deleteSiswa('${s.id}')" title="Hapus"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

// Fungsi Filter (Dipanggil saat mengetik)
function filterSiswaList() {
    const term = document.getElementById('filter-nama-siswa').value.toLowerCase();
    
    // Filter dari cachedSiswaList
    const filtered = cachedSiswaList.filter(s => 
        s.nama.toLowerCase().includes(term) || 
        s.nomor_induk.toLowerCase().includes(term)
    );
    
    renderSiswaTable(filtered);
}

async function uploadSiswaExcel() {
    const f = document.getElementById('excelInput').files[0]; if(!f) return showModal("Pilih file dulu.");
    const r = new FileReader();
    r.onload = async (e) => {
        const wb = XLSX.read(e.target.result, {type:'binary'}); const d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        for(const row of d) { 
            await fetch(`${API_URL}/siswa`, { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
                nama: row.nama, nomor_induk: row.nomorInduk, jenis_kelamin: row.jenisKelamin, agama: row.agama, foto: row.foto, kelas: currentUser.kelas
            })});
        }
        showModal("Import Berhasil!", "Sukses"); closeModal('siswaExcelModal'); loadSiswaData();
    }; r.readAsBinaryString(f);
}

async function downloadSiswaExcel() { 
    const btn = document.querySelector('button[onclick="downloadSiswaExcel()"]');
    const originalText = btn ? btn.innerHTML : '';
    if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...'; btn.disabled = true; }

    try {
        const res = await fetch(`${API_URL}/siswa`);
        const all = await res.json();
        const data = all.filter(s => s.kelas === currentUser.kelas).sort((a,b) => a.nama.localeCompare(b.nama));
        
        let excelData = [];
        if (data && data.length > 0) {
            excelData = data.map(s => ({ nama: s.nama, nomorInduk: s.nomor_induk, jenisKelamin: s.jenis_kelamin || '', agama: s.agama, foto: s.foto || '' }));
        } else {
            excelData = [{nama: "Contoh Siswa", nomorInduk: "12345", jenisKelamin: "Laki-laki", agama: "Islam", foto: ""}];
        }

        const ws = XLSX.utils.json_to_sheet(excelData); 
        const wb = XLSX.utils.book_new(); 
        XLSX.utils.book_append_sheet(wb, ws, "DataSiswa"); 
        XLSX.writeFile(wb, `Siswa_${currentUser.kelas}.xlsx`); 

    } catch (err) { console.error(err); showModal("Gagal mengunduh data.", "Error"); } 
    finally { if(btn) { btn.innerHTML = originalText; btn.disabled = false; } }
}

async function handleFileUpload(input, targetId) {
    const file = input.files[0]; if(!file) return;
    const btn = input.previousElementSibling.tagName === 'BUTTON' ? input.previousElementSibling : input.nextElementSibling;
    
    let oldText = ""; if(btn) { oldText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        try {
            const res = await fetch(`${API_URL}/upload`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ fileName: file.name, fileData: base64 })
            });
            const r = await res.json();
            if(r.status === 'success') { 
                document.getElementById(targetId).value = r.url; 
                const prev = document.getElementById('preview-' + targetId.replace('sk-', 'logo-'));
                if(prev) prev.src = resolveImg(r.url);
                if(targetId === 'profile-foto-url') document.getElementById('preview-profile-foto').src = resolveImg(r.url);
                showModal("Upload Berhasil!", "Sukses"); 
            } else throw new Error("Gagal upload");
        } catch(err) { showModal("Upload Gagal.", "Error"); }
        if(btn) { btn.innerHTML = oldText; btn.disabled = false; }
    };
    reader.readAsDataURL(file);
}

function deleteSiswa(id) { 
    idToDelete = id; 
    deleteType = 'siswa';
    openModal('deleteConfirmModal'); 
}

async function openSiswaModal(id = null) {
    document.getElementById('siswaForm').reset(); document.getElementById('siswaId').value = id || '';
    if (id) { 
        const res = await fetch(`${API_URL}/siswa`); const all = await res.json();
        const data = all.find(s => s.id === id);
        if (data) { 
            document.getElementById('siswaNama').value = data.nama; 
            document.getElementById('siswaInduk').value = data.nomor_induk; 
            document.getElementById('siswaGender').value = data.jenis_kelamin || '';
            document.getElementById('siswaAgama').value = data.agama; 
            document.getElementById('siswaFoto').value = data.foto||''; 
        } 
    }
    openModal('siswaModal');
}

document.getElementById('siswaForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const id = document.getElementById('siswaId').value;
    const p = { 
        nama: document.getElementById('siswaNama').value, nomor_induk: document.getElementById('siswaInduk').value, 
        jenis_kelamin: document.getElementById('siswaGender').value, agama: document.getElementById('siswaAgama').value, 
        foto: document.getElementById('siswaFoto').value, kelas: currentUser.kelas 
    };
    const url = id ? `${API_URL}/siswa/${id}` : `${API_URL}/siswa`;
    const m = id ? 'PUT' : 'POST';
    await fetch(url, { method: m, headers:{'Content-Type':'application/json'}, body:JSON.stringify(p) });
    closeModal('siswaModal'); loadSiswaData(); showModal("Disimpan!", "Sukses");
});

// =======================================================
// 10. EDIT LAPORAN (MODAL)
// =======================================================
async function openEditModal(docId) {
    const d = rawLaporanData.find(x => x.id === docId);
    if(!d) return showModal('Data tidak ditemukan.', 'Error');
    
    const grid = document.getElementById('edit-form-grid'); grid.innerHTML = ''; document.getElementById('editDocId').value = docId;
    grid.innerHTML += `<div class="form-group"><label>Nama Siswa</label><input type="text" value="${d.nama_siswa}" readonly style="background:#F1F5F9;"></div><div class="form-group"><label>Tanggal</label><input type="date" id="edit-tgl" value="${d.tanggal_kegiatan}"></div>`;

    let ibHtml = '<div class="form-group full-width"><label style="font-weight:600; color:var(--primary-color);">Ibadah</label><div class="checklist-container">';
    const ibO = globalSettings.ibadahOptions || {}; const ibS = globalSettings.ibadahSettings || [];
    for (let i = 1; i <= 7; i++) {
        if (ibS[i-1]) {
            let opts = `<option value="">- Belum Mengisi -</option>`;
            (ibO[`ibadah${i}`] || []).forEach(o => { opts += `<option value="${o}" ${d[`ibadah${i}`] === o ? 'selected' : ''}>${o}</option>`; });
            ibHtml += `<div class="form-group" style="margin-bottom:0"><label style="font-size:12px">Ibadah ${i}</label><select id="edit-ib${i}" style="font-size:13px">${opts}</select></div>`;
        }
    }
    grid.innerHTML += ibHtml + '</div></div>';
    grid.innerHTML += `<div class="form-group"><label>Jam Bangun</label><input type="time" id="edit-pagi" value="${d.bangun_pagi?d.bangun_pagi.substring(0,5):''}"></div><div class="form-group"><label>Jam Tidur</label><input type="time" id="edit-tidur" value="${d.tidur_cepat?d.tidur_cepat.substring(0,5):''}"></div>`;
    
    const olgOpts = ["Senam", "Bersepeda", "Lari", "Renang", "Bulu Tangkis", "Sepak Bola", "Karate/Silat", "Melakukan peregangan sebelum mandi"];
    grid.innerHTML += createChecklistGroup('olg', 'Olahraga', olgOpts, d.rincian_olahraga);
    const masyOpts = ["Bermain bersama teman", "Membantu orang tua di rumah", "Belajar kelompok bersama teman", "Membersihkan lingkungan rumah", "Menolong teman"];
    grid.innerHTML += createChecklistGroup('masy', 'Bermasyarakat', masyOpts, d.kegiatan_masyarakat);
    grid.innerHTML += `<div class="form-group"><label>Tempat Belajar</label><input type="text" id="edit-tmpt" value="${d.tempat_belajar||''}"></div><div class="form-group full-width"><label>Materi</label><textarea id="edit-mat" rows="2">${d.materi_belajar||''}</textarea></div>`;
    const mkn = [['makanan_karbo','Karbo','mKarbo'],['makanan_sayur','Sayur','mSayur'],['makanan_susu','Susu','mSusu'],['makanan_lauk','Protein','mProtein'],['makanan_air','Air','mAir']];
    let mknHtml = '<div class="form-group full-width"><label style="font-weight:600; color:var(--primary-color);">Makanan Sehat</label><div class="checklist-container">';
    mkn.forEach(m => { mknHtml += `<label class="checklist-option"><input type="checkbox" id="edit-${m[2]}" ${d[m[0]]?'checked':''}> <span>${m[1]}</span></label>`; });
    grid.innerHTML += mknHtml + '</div></div>';

    openModal('editModal');
}

function createChecklistGroup(prefix, title, opts, saved) {
    const savedArr = saved ? saved.split(',').map(s => s.trim()) : [];
    let lValue = savedArr.find(v => !opts.includes(v)) || '';
    let html = `<div class="form-group full-width"><label style="font-weight:600; color:var(--primary-color);">${title}</label><div class="checklist-container">`;
    opts.forEach((o, i) => { html += `<label class="checklist-option"><input type="checkbox" name="edit-${prefix}" value="${o}" ${savedArr.includes(o)?'checked':''}> <span>${o}</span></label>`; });
    html += `<label class="checklist-option"><input type="checkbox" id="edit-${prefix}-lCheck" name="edit-${prefix}" value="Lainnya" ${lValue?'checked':''} onchange="document.getElementById('edit-${prefix}-lText').style.display=this.checked?'block':'none'"> <span>Lainnya</span></label></div><input type="text" id="edit-${prefix}-lText" class="lainnya-text-input" value="${lValue}" style="display:${lValue?'block':'none'}" placeholder="Sebutkan..."></div>`;
    return html;
}

async function saveChanges() {
     const id = document.getElementById('editDocId').value;
     const body = { 
        tanggal_kegiatan: document.getElementById('edit-tgl').value, 
        bangun_pagi: document.getElementById('edit-pagi').value,
        tidur_cepat: document.getElementById('edit-tidur').value,
        tempat_belajar: document.getElementById('edit-tmpt').value,
        materi_belajar: document.getElementById('edit-mat').value,
        makanan_karbo: document.getElementById('edit-mKarbo').checked,
        makanan_sayur: document.getElementById('edit-mSayur').checked,
        makanan_susu: document.getElementById('edit-mSusu').checked,
        makanan_lauk: document.getElementById('edit-mProtein').checked,
        makanan_air: document.getElementById('edit-mAir').checked,
        rincian_olahraga: getChecklistData('edit-olg', 'edit-olg-lText', 'edit-olg-lCheck'),
        kegiatan_masyarakat: getChecklistData('edit-masy', 'edit-masy-lText', 'edit-masy-lCheck')
     }; 
     for(let i=1;i<=7;i++) { const el = document.getElementById(`edit-ib${i}`); if(el) body[`ibadah${i}`] = el.value; }

     await fetch(`${API_URL}/laporan/${id}`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
     closeModal('editModal'); loadLaporanData(); showModal("Update Sukses", "Info");
}

function getChecklistData(name, textId, checkId) {
    let res = [];
    document.querySelectorAll(`input[name="${name}"]:checked`).forEach(c => { if(c.value !== 'Lainnya') res.push(c.value); });
    const lText = document.getElementById(textId).value.trim();
    if(document.getElementById(checkId).checked && lText) res.push(lText);
    return res.join(', ');
}

// =======================================================
// 11. TABEL LAPORAN HELPER
// =======================================================
function populateLaporanTable(viewType) {
    const thead = document.querySelector("#laporanTable thead");
    const tbody = document.querySelector("#laporanTable tbody");
    const tfoot = document.querySelector("#laporanTable tfoot");
    thead.innerHTML = ""; tbody.innerHTML = ""; tfoot.innerHTML = "";
    if (filteredData.length <= 1) { tbody.innerHTML = `<tr><td colspan="20" style="text-align:center; padding:30px; color:#94A3B8;">Tidak ada data laporan ditemukan.</td></tr>`; return; }
    
    const dataToDisplay = filteredData.slice(1);
    const { ibadahSettings=[], predikat={}, waktu={} } = globalSettings;
    const bPagi = waktu.bangunPagi||'05:00'; const bTidur = waktu.tidurCepat||'21:00'; const ibTh = ibadahSettings.filter(s=>s).length||1;

    if (viewType === 'data') {
        const hRow = document.createElement('tr'); filteredData[0].forEach(h => { const th=document.createElement('th'); th.textContent=h; hRow.appendChild(th); });
        hRow.appendChild(document.createElement('th')).textContent="Aksi"; thead.appendChild(hRow);
        dataToDisplay.forEach(row => {
            const tr = document.createElement('tr'); row.forEach(c => tr.insertCell().textContent=c);
            tr.insertCell().innerHTML = `<button class="action-btn edit" onclick="openEditModal('${row[0]}')"><i class="fas fa-edit"></i></button> <button class="action-btn delete" onclick="deleteLaporanData('${row[0]}')"><i class="fas fa-trash"></i></button>`;
            tbody.appendChild(tr);
        });
    } else if (viewType === 'nilai') {
        const h = ["Nama Siswa", "Tanggal", "I1", "I2", "I3", "I4", "I5", "I6", "I7", "Pagi", "Tidur", "Olga", "Belajar", "Sosial", "Makan"];
        const hRow = document.createElement('tr'); h.forEach(t => hRow.appendChild(document.createElement('th')).textContent = t); thead.appendChild(hRow);
        const sums = new Array(h.length-2).fill(0);
        dataToDisplay.forEach(r => {
            const tr = document.createElement('tr'); tr.insertCell().textContent=r[1]; tr.insertCell().textContent=r[2];
            let idx=0;
            for(let j=3; j<=9; j++) { const v=String(r[j]).trim()?1:0; tr.insertCell().innerHTML=v?`<span style="color:var(--success-color)">●</span>`:`<span style="color:#E2E8F0">●</span>`; if(v) sums[idx]++; idx++; }
            const p=(r[10]&&r[10]<=bPagi)?1:0; tr.insertCell().innerHTML=p?`<span style="color:var(--success-color)">●</span>`:`<span style="color:#E2E8F0">●</span>`; if(p) sums[idx]++; idx++;
            const t=(r[11]&&r[11]<=bTidur)?1:0; tr.insertCell().innerHTML=t?`<span style="color:var(--success-color)">●</span>`:`<span style="color:#E2E8F0">●</span>`; if(t) sums[idx]++; idx++;
            const o=String(r[12]).trim()?1:0; tr.insertCell().innerHTML=o?`<span style="color:var(--success-color)">●</span>`:`<span style="color:#E2E8F0">●</span>`; if(o) sums[idx]++; idx++;
            const b=(String(r[13]).trim()&&String(r[14]).trim())?1:0; tr.insertCell().innerHTML=b?`<span style="color:var(--success-color)">●</span>`:`<span style="color:#E2E8F0">●</span>`; if(b) sums[idx]++; idx++;
            const s=String(r[15]).trim()?1:0; tr.insertCell().innerHTML=s?`<span style="color:var(--success-color)">●</span>`:`<span style="color:#E2E8F0">●</span>`; if(s) sums[idx]++; idx++;
            const m=r.slice(16,21).every(v=>v==='Ya')?1:0; tr.insertCell().innerHTML=m?`<span style="color:var(--success-color)">●</span>`:`<span style="color:#E2E8F0">●</span>`; if(m) sums[idx]++;
            tbody.appendChild(tr);
        });
        const fRow = tfoot.insertRow(); fRow.insertCell().colSpan=2; fRow.insertCell().innerHTML="<strong>Rata-rata %</strong>";
        sums.forEach(s => fRow.insertCell().innerHTML=`<strong>${((s/dataToDisplay.length)*100).toFixed(0)}%</strong>`);
    } else {
        const h = ["Nama Siswa", "Beribadah", "Tidur Cepat", "Bangun Pagi", "Olahraga", "Belajar", "Bermasyarakat", "Makan Sehat"]; if(viewType==='predikat') h.push("Aksi");
        const hRow = document.createElement('tr'); h.forEach(t => hRow.appendChild(document.createElement('th')).textContent = t); thead.appendChild(hRow);
        const rekap = {};
        dataToDisplay.forEach(r => {
            const n = r[1]; if(!rekap[n]) rekap[n]={tot:0,ib:0,td:0,bg:0,ol:0,bl:0,ms:0,mk:0}; rekap[n].tot++;
            let ibP=0; for(let j=0; j<7; j++) if(ibadahSettings[j] && String(r[j+3]).trim()) ibP++;
            if(ibP>=ibTh) rekap[n].ib++; if(r[11]&&r[11]<=bTidur) rekap[n].td++; if(r[10]&&r[10]<=bPagi) rekap[n].bg++;
            if(String(r[12]).trim()) rekap[n].ol++; if(String(r[13]).trim()&&String(r[14]).trim()) rekap[n].bl++; if(String(r[15]).trim()) rekap[n].ms++;
            if(r.slice(16,21).every(v=>v==='Ya')) rekap[n].mk++;
        });
        for(const n in rekap) {
            const d = rekap[n]; const tr = document.createElement('tr'); tr.insertCell().textContent = n;
            const keys = ['ib','td','bg','ol','bl','ms','mk']; const pdfD={};
            keys.forEach(k => {
                const cell = tr.insertCell();
                if(viewType==='rekap') cell.textContent = `${d[k]}/${d.tot}`;
                else {
                    let pd = predikat.kurangText||'Kurang'; const p=(d[k]/d.tot)*100;
                    if(p>(predikat.taatValue||90)) pd = predikat.taatText||'Taat';
                    else if(p>(predikat.terbiasaValue||50)) pd = predikat.terbiasaText||'Terbiasa';
                    const color = pd===(predikat.taatText||'Taat')?'var(--success-color)':(pd===(predikat.terbiasaText||'Terbiasa')?'var(--warning-color)':'var(--danger-color)');
                    cell.innerHTML = `<span style="color:${color}; font-weight:600;">${pd}</span>`; pdfD[k]=pd;
                }
            });
            if(viewType==='predikat') {
                const safeName = n.replace(/'/g, "\\'");
                tr.insertCell().innerHTML = `<button class="action-btn download" onclick='downloadPDF("${safeName}", ${JSON.stringify(pdfD)})'><i class="fas fa-file-pdf"></i></button>`;
            }
            tbody.appendChild(tr);
        }
    }
}

function deleteLaporanData(id) {
    idToDelete = id;
    deleteType = 'laporan';
    openModal('deleteConfirmModal');
}

// =======================================================
// 12. UTILS: PDF DOWNLOAD, BACKUP, RESTORE, PROFILE
// =======================================================
function downloadPDF(name, predicates) {
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    const info = globalSettings.infoSekolah || {};
    
    doc.setFontSize(16); doc.text(info.namaSekolah || "Sekolah", 105, 20, {align:"center"});
    doc.setFontSize(10); doc.text("Laporan Pembiasaan Harian 7KAIH", 105, 26, {align:"center"});
    doc.setLineWidth(0.5); doc.line(20, 32, 190, 32); 
    
    doc.setFontSize(12); doc.text(`Nama: ${name}`, 20, 50); doc.text(`Kelas: ${currentUser.kelas}`, 20, 57);
    const body = []; const map = {ib:"Beribadah", td:"Tidur Cepat", bg:"Bangun Pagi", ol:"Olahraga", bl:"Belajar", ms:"Bermasyarakat", mk:"Makan Bergizi"};
    for(let k in predicates) body.push([map[k], predicates[k]]);
    doc.autoTable({ head:[['Kategori','Predikat']], body:body, startY:70, theme:'grid', headStyles: { fillColor: [74, 144, 226] } });
    let finalY = doc.lastAutoTable.finalY + 20; if (finalY > 250) { doc.addPage(); finalY = 20; }
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const place = info.namaTempat || 'Tempat';
    
    doc.setFontSize(10);
    doc.text('Mengetahui,', 20, finalY + 7); doc.text('Kepala Sekolah', 20, finalY + 14);
    doc.text(info.namaKepsek || '', 20, finalY + 37); doc.text(`NIP. ${info.nipKepsek || '-'}`, 20, finalY + 44);

    doc.text(`${place}, ${today}`, 190, finalY, { align: 'right' });
    doc.text(`Guru Kelas ${currentUser.kelas}`, 190, finalY + 7, { align: 'right' });
    doc.text(currentUser.nama || '', 190, finalY + 37, { align: 'right' });
    doc.text(`NIP. ${currentUser.nip || '-'}`, 190, finalY + 44, { align: 'right' });

    doc.save(`Laporan_${name}.pdf`);
}

function downloadRekapPDF() {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape' });
    const info = globalSettings.infoSekolah || {};
    const startDate = document.getElementById('rep-startDate').value; const endDate = document.getElementById('rep-endDate').value;
    let periode = (startDate && endDate) ? `${startDate} s/d ${endDate}` : 'Keseluruhan';

    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text(info.namaSekolah || "Sekolah", 148, 15, { align: "center" });
    doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text(`Rekap Kelas ${currentUser.kelas} - ${activeLaporanView.toUpperCase()} (${periode})`, 148, 22, { align: "center" });

    const tbl = document.getElementById('laporanTable').cloneNode(true);
    const headers = tbl.querySelectorAll('thead th'); if (headers.length>0 && headers[headers.length-1].textContent.trim()==='Aksi') { headers[headers.length-1].remove(); tbl.querySelectorAll('tbody tr').forEach(r => { const c=r.querySelectorAll('td'); if(c.length>0) c[c.length-1].remove(); }); }

    doc.autoTable({ html: tbl, startY: 35, theme: 'grid', headStyles: { fillColor: [74, 144, 226] } });
    
    let finalY = doc.lastAutoTable.finalY + 20; if (finalY > 160) { doc.addPage(); finalY = 20; }
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFontSize(10);
    doc.text('Mengetahui,', 20, finalY + 7); doc.text('Kepala Sekolah', 20, finalY + 14);
    doc.text(info.namaKepsek || '', 20, finalY + 37); doc.text(`NIP. ${info.nipKepsek || '-'}`, 20, finalY + 44);

    doc.text(`${info.namaTempat || 'Tempat'}, ${today}`, 280, finalY, { align: 'right' });
    doc.text(`Guru Kelas ${currentUser.kelas}`, 280, finalY + 7, { align: 'right' });
    doc.text(currentUser.nama || '', 280, finalY + 37, { align: 'right' });
    doc.text(`NIP. ${currentUser.nip || '-'}`, 280, finalY + 44, { align: 'right' });

    doc.save(`Rekap_${currentUser.kelas}.pdf`);
}

async function backupSystem() {
    const btn = document.querySelector('button[onclick="backupSystem()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
    btn.disabled = true;

    try {
        const resSiswa = await fetch(`${API_URL}/siswa`);
        const allSiswa = await resSiswa.json();
        const siswaData = allSiswa.filter(s => s.kelas === currentUser.kelas);

        const resLaporan = await fetch(`${API_URL}/laporan?kelas=${currentUser.kelas}`);
        const laporanData = await resLaporan.json();

        const backup = { 
            meta: {
                version: "1.0",
                exported_at: new Date().toISOString(),
                exported_by: currentUser.username,
                kelas: currentUser.kelas
            },
            settings: globalSettings, 
            laporan: laporanData || [], 
            siswa: siswaData || []
        };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); 
        a.href = URL.createObjectURL(blob); 
        a.download = `Backup_${currentUser.kelas}_${new Date().toISOString().slice(0,10)}.json`; 
        a.click();
        
        showModal("Backup data berhasil diunduh!", "Sukses");
    } catch (err) {
        showModal("Gagal melakukan backup: " + err.message, "Error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function handleRestoreFile(input) {
    const file = input.files[0];
    if (!file) return;

    input.value = '';

    showConfirmModal("Apakah Anda yakin ingin memulihkan data dari file ini? Data yang ada mungkin akan diperbarui atau ditimpa.", async () => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);
                let successCount = 0;

                if (!backupData.settings && !backupData.siswa && !backupData.laporan) {
                    throw new Error("Format file backup tidak valid.");
                }

                if (backupData.settings) {
                    await fetch(`${API_URL}/pengaturan`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ data: backupData.settings }) });
                    successCount++;
                }

                if (backupData.siswa && Array.isArray(backupData.siswa)) {
                    for(const s of backupData.siswa) {
                        await fetch(`${API_URL}/siswa`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(s) });
                    }
                    successCount++;
                }

                if (backupData.laporan && Array.isArray(backupData.laporan)) {
                    for(const l of backupData.laporan) {
                        await fetch(`${API_URL}/laporan`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(l) });
                    }
                    successCount++;
                }

                if (successCount > 0) {
                    showModal("Data berhasil dipulihkan! Halaman akan dimuat ulang.", "Sukses");
                    setTimeout(() => window.location.reload(), 2000);
                } else {
                    showModal("Tidak ada data yang dipulihkan.", "Info");
                }

            } catch (err) {
                showModal("Gagal memproses file restore: " + err.message, "Error");
            }
        };
        reader.readAsText(file);
    });
}

async function resetLaporan() { 
    if(confirm("Hapus semua laporan di kelas ini?")) { 
        await fetch(`${API_URL}/laporan?kelas=${currentUser.kelas}`, { method: 'DELETE' });
        loadLaporanData(); 
    } 
}

function populateProfileForm() {
    if(!currentUser) return;
    document.getElementById('profile-nama').value = currentUser.nama;
    document.getElementById('profile-username').value = currentUser.username;
    document.getElementById('profile-password').value = currentUser.password;
    document.getElementById('profile-kelas').value = currentUser.kelas;
    
    if(currentUser.foto) {
        document.getElementById('preview-profile-foto').src = resolveImg(currentUser.foto);
        document.getElementById('profile-foto-url').value = currentUser.foto;
    }
}

async function updateGuruProfile() {
    const nama = document.getElementById('profile-nama').value;
    const username = document.getElementById('profile-username').value;
    const password = document.getElementById('profile-password').value;
    const kelas = document.getElementById('profile-kelas').value;
    const foto = document.getElementById('profile-foto-url').value; 

    if(!nama || !username || !password || !kelas) return showModal("Semua kolom harus diisi!");

    try {
        const res = await fetch(`${API_URL}/users/${currentUser.id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nama, username, password, kelas, foto })
        });
        
        if (!res.ok) throw new Error("Gagal update profil");
        
        currentUser.nama = nama; currentUser.username = username; currentUser.password = password; currentUser.kelas = kelas;
        currentUser.foto = foto; 
        sessionStorage.setItem('guruUser', JSON.stringify(currentUser));
        
        document.getElementById('guru-name-display').textContent = `${currentUser.nama} (${currentUser.kelas})`;
        document.querySelector('.sidebar-header h3').innerHTML = `<i class="fas fa-school"></i> ${currentUser.kelas}`;
        document.getElementById('span-kelas').textContent = currentUser.kelas;

        showModal("Profil berhasil diperbarui!", "Sukses");
    } catch(e) {
        showModal("Gagal memperbarui profil: " + e.message, "Error");
    }
}

// =======================================================
// 13. UTILS & MODAL CONTROLS
// =======================================================
function showModal(text, title = 'Pemberitahuan') { document.getElementById('msgTitle').textContent = title; document.getElementById('msgText').textContent = text; openModal('msgModal'); }
function showConfirmModal(text, onConfirm) { 
    document.getElementById('msgTitle').textContent = 'Konfirmasi'; document.getElementById('msgText').textContent = text;
    const btnWrap = document.getElementById('msgModalButtons'); btnWrap.innerHTML = '';
    const cBtn = document.createElement('button'); cBtn.className = 'btn btn-danger'; cBtn.textContent = 'Ya, Lanjutkan'; cBtn.onclick = () => { closeModal('msgModal'); onConfirm(); };
    const aBtn = document.createElement('button'); aBtn.className = 'btn btn-secondary'; aBtn.textContent = 'Batal'; aBtn.onclick = () => closeModal('msgModal');
    btnWrap.appendChild(aBtn); btnWrap.appendChild(cBtn); openModal('msgModal'); 
}
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.getElementById('logoutButtonSide').addEventListener('click', () => { sessionStorage.clear(); window.location.reload(); });
window.onload = () => { const stored = sessionStorage.getItem('guruUser'); if (stored) { currentUser = JSON.parse(stored); initDashboard(); } };