-- 1. BERSIHKAN TABEL LAMA (JIKA ADA) AGAR TIDAK ERROR SAAT DI-RUN ULANG
DROP TABLE IF EXISTS public.laporan;
DROP TABLE IF EXISTS public.siswa;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.pengaturan;

-- 2. BUAT TABEL USERS (Untuk Guru & Admin)
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    username text NOT NULL UNIQUE,
    password text NOT NULL, 
    nama text NOT NULL,
    role text NOT NULL CHECK (role IN ('Guru', 'Admin', 'Kepsek')),
    kelas text,
    foto text,
    nip text
);

-- 3. BUAT TABEL SISWA (DITAMBAHKAN KOLOM jenis_kelamin)
CREATE TABLE public.siswa (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    nomor_induk text NOT NULL UNIQUE,
    nama text NOT NULL,
    kelas text NOT NULL,
    jenis_kelamin text, 
    agama text,
    foto text
);

-- 4. BUAT TABEL LAPORAN
CREATE TABLE public.laporan (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    tanggal_kegiatan date NOT NULL,
    
    -- Identitas Pelapor
    siswa_nomor_induk text REFERENCES public.siswa(nomor_induk) ON UPDATE CASCADE,
    nama_siswa text,
    kelas text,

    -- Ibadah
    ibadah1 text,
    ibadah2 text,
    ibadah3 text,
    ibadah4 text,
    ibadah5 text,
    ibadah6 text,
    ibadah7 text,

    -- Waktu
    bangun_pagi time,
    tidur_cepat time,

    -- Kegiatan
    rincian_olahraga text,
    kegiatan_masyarakat text,
    tempat_belajar text,
    materi_belajar text,

    -- Makanan (Boolean / Checkbox)
    makanan_karbo boolean DEFAULT false,
    makanan_sayur boolean DEFAULT false,
    makanan_susu boolean DEFAULT false,
    makanan_lauk boolean DEFAULT false,
    makanan_air boolean DEFAULT false
);

-- 5. BUAT TABEL PENGATURAN (JSONB)
CREATE TABLE public.pengaturan (
    key text PRIMARY KEY,
    data jsonb
);

-- ==========================================
-- SEEDING DATA (DATA DEFAULT)
-- ==========================================

-- A. Masukkan User GURU
INSERT INTO public.users (username, password, nama, role, kelas, foto)
VALUES 
('Ika', 'Ika1234', 'Ika Nirmala, M.Pd', 'Guru', '4A', 'https://lh3.googleusercontent.com/d/1bvXBQXkjZCn6yG2A_h69XF4Pc5zHL9rx');

-- B. Masukkan User ADMIN
INSERT INTO public.users (username, password, nama, role, kelas)
VALUES 
('Admin', 'Admin123', 'Administrator', 'Admin', NULL);

INSERT INTO public.siswa (id, created_at, nomor_induk, nama, kelas, agama, foto, jenis_kelamin) VALUES
('fc2777c8-314d-49d5-a590-b53c8fbf7402', '2025-12-27 16:18:40.758121+00:00', '12351', 'Bintang Adhi Permana', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/08/29/kim-soo-hyun-soohyunk216.jpeg?w=720', 'Laki-laki'),
('f720c423-c80f-40bc-9697-4d57937b2425', '2025-12-27 16:18:40.945331+00:00', '12352', 'Ibnu Sina', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/07/10/aktor-korea-selatan-gong-yoo_43.jpeg?w=480', 'Laki-laki'),
('35d7b4eb-0e08-4615-b421-031300264131', '2025-12-26 02:44:58.621906+00:00', '12345', 'Budi Santoso', '4A', 'Islam', 'https://lh3.googleusercontent.com/d/1ygzHqQe262UuRTsQVaF5-QyPjHkGEDu0', 'Laki-laki'),
('ab211e75-0221-480d-933c-8b6e754cc5a0', '2025-12-27 16:18:41.769433+00:00', '12358', 'Bintang Ganteng 14', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/10/23/kim-so-hyun_169.jpeg?w=620', 'Laki-laki'),
('349d589b-633d-43b3-bf28-0618b4d981c6', '2025-12-27 16:18:41.917338+00:00', '12359', 'Bintang Ganteng 15', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2022/08/20/kim-yoo-jung_169.jpeg?w=620', 'Laki-laki'),
('f5592001-c295-47d8-9799-0489b865d422', '2025-12-27 16:18:42.375731+00:00', '12362', 'Bintang Ganteng 18', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/06/08/hyun-bin-5.jpeg?w=1080', 'Laki-laki'),
('3cbb0289-1edf-4204-89ee-7551dcffa55f', '2025-12-27 16:18:42.495214+00:00', '12363', 'Bintang Ganteng 19', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/10/23/jisoo-blackpink_169.jpeg?w=620', 'Perempuan'),
('16bf1613-b548-46ae-9cb0-a1df3ecd613a', '2025-12-27 16:18:42.619211+00:00', '12364', 'Bintang Ganteng 20', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/10/23/kim-ji-won_169.jpeg?w=620', 'Laki-laki'),
('88d0dc96-c4cb-49fd-997f-c6ed6ef7977a', '2025-12-27 16:18:42.748683+00:00', '12365', 'Bintang Ganteng 21', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/04/07/a88327c5-47ef-4f97-8187-c693cf190038_43.png?w=480', NULL),
('10045ee9-4718-426a-849f-9056c9d3b0f3', '2025-12-27 16:18:42.872026+00:00', '12366', 'Bintang Ganteng 22', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/08/29/kim-soo-hyun-soohyunk216.jpeg?w=720', NULL),
('9c8d46ed-c49e-4c18-9b2a-cb9818236529', '2025-12-27 16:18:43.011516+00:00', '12367', 'Bintang Ganteng 23', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/07/10/aktor-korea-selatan-gong-yoo_43.jpeg?w=480', NULL),
('cf0e61b6-bb0a-444b-a43c-e12af3cd6e0d', '2025-12-27 16:18:43.149511+00:00', '12368', 'Bintang Ganteng 24', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2021/01/04/han-hyo-joo-3_169.jpeg?w=620', NULL),
('5e6a8fca-d1b3-48ad-b3d5-645d210cfa31', '2025-12-27 16:18:43.295499+00:00', '12369', 'Bintang Ganteng 25', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/04/07/a88327c5-47ef-4f97-8187-c693cf190038_43.png?w=480', NULL),
('3206a196-821e-4b10-9a64-f9047d17439c', '2025-12-27 16:18:43.447353+00:00', '12370', 'Bintang Ganteng 26', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/08/29/kim-soo-hyun-soohyunk216.jpeg?w=720', NULL),
('c5cb8617-b374-4057-abc3-5691aa72eff2', '2025-12-27 16:18:43.745729+00:00', '12372', 'Bintang Ganteng 28', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/05/05/bae-suzy_169.jpeg?w=620', NULL),
('59255401-6558-4ed9-87a3-5a64c37544f7', '2025-12-27 16:18:43.892194+00:00', '12373', 'Bintang Ganteng 29', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/04/07/a88327c5-47ef-4f97-8187-c693cf190038_43.png?w=480', NULL),
('556ea773-2eac-41ed-9491-74847b233f9e', '2025-12-27 16:18:40.075361+00:00', '12346', 'Bachtiar Adya Permana', '4A', 'Islam', 'https://img.okezone.com/content/2021/07/21/206/2443924/5-artis-korea-ganteng-selalu-bikin-kaum-hawa-bertekuk-lutut-7sTcItOg3N.jpg', NULL),
('d92cdc2f-90e4-49df-9081-22d8570f5c3f', '2025-12-27 16:18:40.218358+00:00', '12347', 'Bianka Arsyla Permana', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/10/23/jisoo-blackpink_169.jpeg?w=620', NULL),
('99e05288-0408-4d11-a26c-6e8bdef53d7c', '2025-12-27 16:18:40.350812+00:00', '12348', 'Buana Asrhaka Permana', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2021/07/26/ji-chang-wook-dok-igjichangwookh_43.png?w=480', NULL),
('eedc978f-edec-4645-8632-584bc70731c2', '2025-12-27 16:18:40.50102+00:00', '12349', 'Indriana Mulyani', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/10/23/chae-soo-bin_169.jpeg?w=620', NULL),
('4f5a6d0a-9914-439b-a6c3-8e37f5a9d4df', '2025-12-27 16:18:40.61508+00:00', '12350', 'Bangbin', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/04/07/a88327c5-47ef-4f97-8187-c693cf190038_43.png?w=480', NULL),
('d8dcee1b-7701-41f9-9376-149bb6cc24e4', '2025-12-27 16:18:41.078598+00:00', '12353', 'Cristopus Colombus', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2022/08/20/kim-yoo-jung_169.jpeg?w=620', NULL),
('91e47151-9bfc-4ae3-9167-d1048cb8461b', '2025-12-27 16:18:41.205157+00:00', '12354', 'Joko Widodo', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2021/03/10/lee-min-ho-source-soompicom_43.jpeg?w=480', NULL),
('3efbfe79-b62a-46a6-931a-1eeafff41103', '2025-12-27 16:18:41.346737+00:00', '12355', 'Praroro Subiantoro', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2019/06/28/c42c4b95-6b3d-4911-ad3b-85bdb3b9acb6_43.png?w=480', NULL),
('21744ad1-a084-4946-a4d4-9aa9ab62a3cf', '2025-12-27 16:18:41.500065+00:00', '12356', 'Evan Dimas Darmawan', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/06/08/hyun-bin-5.jpeg?w=1080', NULL),
('886fcfd6-771f-4ff0-b88a-6050aafaab1a', '2025-12-27 16:18:42.10271+00:00', '12360', 'Rocky Gerung', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2021/03/10/lee-min-ho-source-soompicom_43.jpeg?w=480', NULL),
('74f4d5f5-bc32-41c4-b20b-e2d706ac1a2b', '2025-12-27 16:18:43.60102+00:00', '12371', 'Mancing Mania', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2020/07/10/aktor-korea-selatan-gong-yoo_43.jpeg?w=480', NULL),
('91179e74-1916-4b84-b3ab-1d71103a8816', '2025-12-27 16:18:41.630083+00:00', '12357', 'Irina Shark', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2023/10/23/jisoo-blackpink_169.jpeg?w=620', NULL),
('0c80979f-e385-4284-baac-f046819f022e', '2025-12-27 16:18:42.247149+00:00', '12361', 'David Trezeguet', '4A', 'Islam', 'https://akcdn.detik.net.id/community/media/visual/2019/06/28/c42c4b95-6b3d-4911-ad3b-85bdb3b9acb6_43.png?w=480', NULL);


INSERT INTO public.laporan (
    tanggal_kegiatan, siswa_nomor_induk, nama_siswa, kelas, 
    bangun_pagi, tidur_cepat, 
    makanan_karbo, makanan_sayur, makanan_air,
    ibadah1, ibadah2
)
VALUES 
(CURRENT_DATE, '12346', 'Bachtiar Adya Permana', '4A', '04:30', '20:30', true, true, true, 'Subuh', 'Zuhur'),
(CURRENT_DATE, '12347', 'Bianka Arsyla Permana', '4A', '05:00', '21:00', true, false, true, 'Subuh', 'Berhalangan');

-- 5. INSERT PENGATURAN DENGAN STRUKTUR YANG BENAR
-- Visi Misi dan Pengumuman sekarang berada DI DALAM objek infoSekolah
INSERT INTO public.pengaturan (key, data)
VALUES 
('global', '{
  "infoSekolah": {
    "namaSekolah": "SDN Bangbin Merdeka",
    "namaKepsek": "Bintang A. Permana, M.Bg",
    "nipKepsek": "6281310051985",
    "namaTempat": "Jakarta",
    "npsn": "123456",
    "alamat": "Jalan Setu",
    "jenjang": "Sekolah Dasar",
    "logo": "https://lh3.googleusercontent.com/d/16rll5zsRdwTbR3nF_NmPKwY51tg4tnOn",
    "socialMedia": {
      "youtube": "https://www.youtube.com/@sdnsetu0234",
      "facebook": "https://www.facebook.com/ika.nirmala",
      "whatsapp": "6281310051985",
      "instagram": "https://www.instagram.com/ika.nirmala/?__d=1"
    },
    "youtubeLinks": [
      "https://youtu.be/fd252EjWcD0?si=V3WdOHMBPPpaPhtL",
      "https://youtu.be/mBvaFcjy1kY?si=mCxd_5-j3sucBh1r",
      "https://youtu.be/9eYim0dAZOs?si=VIM05kmf0dd1o6YB"
    ],
    "sambutanKepsek": "Assalamu''alaikum Warahmatullahi Wabarakatuh,\n\nPuji syukur kehadirat Tuhan Yang Maha Esa atas segala rahmat dan karunia-Nya. Selamat datang di portal digital sekolah kami. Portal ini kami hadirkan sebagai sarana informasi dan komunikasi antara sekolah, siswa, orang tua, dan masyarakat. Kami berharap, melalui platform ini, kita dapat bersinergi untuk meningkatkan kualitas pendidikan dan menciptakan lingkungan belajar yang inspiratif. Mari manfaatkan fasilitas ini dengan sebaik-baiknya untuk kemajuan bersama.\n\nWassalamu''alaikum Warahmatullahi Wabarakatuh.",
    "galeri": [
      "https://lh3.googleusercontent.com/d/1T18aTnyZfiBKyYOxghuHHD-1eMdX759u",
      "https://lh3.googleusercontent.com/d/1VwmUjNvx8IQ3ONAjHa6FEHQX4lAY8je7",
      "https://lh3.googleusercontent.com/d/13RT19DCoxMNNih9E5tHxUfhCpgWtXI2q",
      "https://lh3.googleusercontent.com/d/1U4SCDLbrZpAX9NNmY5RHt4A54EfOmbZY",
      "https://lh3.googleusercontent.com/d/1tfA7mJZVlwtiLqXOiUk8BX7-FOqeL2_M",
      "https://lh3.googleusercontent.com/d/11cx9lYzT3V7u0WxNGoqKb4DFQU-uWdEW",
      "https://www.myduandu.com/cdn/shop/files/048cc954-746d-4d94-a7a2-c20ba0e95d43.jpg?v=1754234869&width=1646",
      "https://static.desty.app/desty-omni/20230830/e334205d1edc4a019595f51c988e548e.jpg?x-oss-process=image/format,webp",
      "https://static.desty.app/desty-omni/20230830/6c2bed3e69fc499595a1204cab564588.jpg?x-oss-process=image/format,webp",
      "https://lh3.googleusercontent.com/d/1FUqBnzkIhTiI7_H3riFx8UwEb6uJPcNa"
    ],
    "visiMisi": {
      "misi": "<ol>\n<li> Menanamkan keimanan dan ketakwaan terhadap Tuhan YME.</li>\n<li> Merancang pembelajaran yang menarik dan menyenangkan.</li>\n<li> Membangun lingkungan sekolah sehat yang membentuk peserta didik memiliki semangat berkolaborasi, dan keterampilan berkomunikasi yang efektif.</li>\n<li>⁠ Membangun lingkungan sekolah yang bertoleransi, mencintai budaya lokal, dan berkesadaran kewargaan</li>\n<li>⁠ Mengembangkan kemandirian, penalaran kritis, dan kreativitas peserta didik.</li>\n</ol>",
      "visi": "Terwujudnya peserta didik sebagi pembelajar sepanjang hayat yang mengintegrasikan delapan dimensi profil lulusan dan berwawasan lingkungan",
      "tujuan": "Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan Tujuan "
    },
    "pengumuman": {
      "pengumuman1": {
        "pengumuman1Text": "Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah \nLibur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah Libur Sekolah ",
        "pengumuman1Judul": "Libur Sekolah",
        "pengumuman1Gambar": "https://lh3.googleusercontent.com/d/14C5_z5porb9JSjsQUhjlkBq2_zL0MB2t",
        "pengumuman1Dokumen": ""
      },
      "pengumuman2": {
        "pengumuman2Text": " Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur \nPembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur Pembagian MBG Saat Libur ",
        "pengumuman2Judul": "Pembagian MBG Saat Libur",
        "pengumuman2Gambar": "https://lh3.googleusercontent.com/d/14C5_z5porb9JSjsQUhjlkBq2_zL0MB2t",
        "pengumuman2Dokumen": ""
      },
      "pengumuman3": {
        "pengumuman3Text": "",
        "pengumuman3Judul": "",
        "pengumuman3Gambar": "",
        "pengumuman3Dokumen": ""
      }
    }
  },
  "predikat": { 
    "taatText": "Anak Hebat", 
    "taatValue": 85, 
    "terbiasaText": "Terbiasa", 
    "terbiasaValue": 60,
    "kurangText": "Perlu Bimbingan"
  },
  "waktu": { 
    "bangunPagi": "05:00", 
    "tidurCepat": "21:00" 
  },
  "ibadahSettings": [true, true, true, true, true, false, false],
  "ibadahOptions": {
     "ibadah1": ["Subuh", "Berdoa", "Sembahyang", "Berhalangan"],
     "ibadah2": ["Zuhur", "Berdoa", "Sembahyang", "Berhalangan"],
     "ibadah3": ["Asar", "Berdoa", "Sembahyang", "Berhalangan"],
     "ibadah4": ["Magrib", "Berdoa", "Sembahyang", "Berhalangan"],
     "ibadah5": ["Isya", "Berdoa", "Sembahyang", "Berhalangan"]
  }
}');

-- 6. SETUP POLICY (ROW LEVEL SECURITY)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laporan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengaturan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read/write for all" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all" ON public.siswa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all" ON public.laporan FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all" ON public.pengaturan FOR ALL USING (true) WITH CHECK (true);
