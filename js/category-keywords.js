// Kamus bawaan: kata kunci → kategori (nama kategori bawaan). Mudah ditambah.
// Berisi kata Indonesia dan Inggris, karena catatan pengguna bisa memakai keduanya.
// Frasa boleh lebih dari satu kata; frasa yang lebih panjang menang.
export const CATEGORY_KEYWORDS = {
  Food: ['nasi', 'makan', 'makan siang', 'makan malam', 'sarapan', 'ayam', 'bakso', 'mie', 'mi ayam', 'padang', 'warteg', 'sate', 'soto', 'gofood', 'go food', 'grabfood', 'grab food', 'shopeefood', 'shopee food', 'geprek', 'pecel', 'lalapan', 'seblak', 'rendang', 'katering', 'catering', 'lunch', 'dinner', 'breakfast', 'restaurant', 'restoran', 'pizza', 'burger', 'mcd', 'kfc', 'sushi', 'ramen'],
  Snacks: ['kopi', 'coffee', 'boba', 'snack', 'cemilan', 'camilan', 'roti', 'martabak', 'gorengan', 'es teh', 'es kopi', 'jajan', 'donat', 'eskrim', 'es krim', 'ice cream', 'cilok', 'thai tea', 'starbucks', 'janji jiwa', 'kopi kenangan', 'chatime'],
  Groceries: ['indomaret', 'alfamart', 'alfamidi', 'supermarket', 'superindo', 'hypermart', 'transmart', 'lotte mart', 'beras', 'sayur', 'pasar', 'minyak goreng', 'galon', 'gas elpiji', 'elpiji', 'telur', 'detergen', 'sabun', 'sampo', 'groceries', 'grocery', 'belanja bulanan'],
  Shopping: ['belanja', 'shopee', 'tokopedia', 'lazada', 'tiktok shop', 'blibli', 'zalora', 'uniqlo', 'baju', 'celana', 'sepatu', 'kaos', 'jaket', 'tas', 'clothes', 'shoes', 'gadget', 'aksesoris'],
  Transport: ['bensin', 'pertamax', 'pertalite', 'solar', 'spbu', 'fuel', 'gas station', 'grab', 'gojek', 'goride', 'grabbike', 'grabcar', 'gocar', 'maxim', 'ojek', 'ojol', 'parkir', 'parking', 'tol', 'etoll', 'e toll', 'krl', 'mrt', 'lrt', 'kereta', 'busway', 'transjakarta', 'taksi', 'taxi', 'angkot', 'bus', 'servis motor', 'servis mobil', 'ganti oli', 'bengkel', 'uber'],
  Rent: ['kos', 'kost', 'kosan', 'sewa', 'kontrakan', 'rent', 'apartemen', 'apartment', 'ipl', 'iuran rumah', 'iuran rt', 'kpr'],
  Utilities: ['listrik', 'token', 'token listrik', 'pln', 'pdam', 'electricity', 'water bill', 'sampah', 'iuran sampah'],
  'Phone & Internet': ['internet', 'wifi', 'indihome', 'biznet', 'first media', 'myrepublic', 'pulsa', 'paket data', 'kuota', 'telkomsel', 'xl', 'indosat', 'smartfren', 'phone bill'],
  Subscriptions: ['netflix', 'spotify', 'youtube premium', 'disney', 'disney hotstar', 'vidio', 'prime video', 'apple music', 'icloud', 'google one', 'chatgpt', 'claude', 'canva', 'langganan', 'subscription', 'membership'],
  Health: ['obat', 'apotek', 'apotik', 'dokter', 'doctor', 'klinik', 'clinic', 'vitamin', 'rumah sakit', 'hospital', 'puskesmas', 'periksa', 'masker', 'halodoc', 'dentist', 'dokter gigi', 'lab'],
  Fitness: ['gym', 'fitness', 'membership gym', 'gym membership', 'olahraga', 'futsal', 'badminton', 'renang', 'swimming', 'yoga', 'pilates', 'lari', 'running', 'sepeda', 'cycling', 'padel', 'tenis', 'basket', 'workout', 'personal trainer'],
  'Personal Care': ['potong rambut', 'pangkas', 'barber', 'barbershop', 'salon', 'skincare', 'kosmetik', 'makeup', 'parfum', 'perfume', 'laundry', 'spa', 'facial', 'creambath', 'nail'],
  Entertainment: ['nonton', 'bioskop', 'cinema', 'movie', 'xxi', 'cgv', 'game', 'steam', 'konser', 'concert', 'karaoke', 'tiket', 'ticket', 'top up game', 'hiburan'],
  Education: ['kursus', 'course', 'les', 'sekolah', 'school', 'kuliah', 'ukt', 'spp', 'buku', 'book', 'udemy', 'coursera', 'seminar', 'workshop', 'bootcamp', 'tuition'],
  Travel: ['hotel', 'tiket pesawat', 'pesawat', 'flight', 'traveloka', 'tiket com', 'airbnb', 'liburan', 'holiday', 'vacation', 'villa', 'oleh oleh', 'agoda'],
  Family: ['anak', 'popok', 'susu anak', 'mainan', 'toys', 'kids', 'orang tua', 'kirim ortu', 'ortu', 'family', 'keluarga', 'daycare'],
  Pets: ['kucing', 'anjing', 'pet', 'makanan kucing', 'cat food', 'dog food', 'whiskas', 'grooming', 'vet', 'dokter hewan', 'pasir kucing'],
  'Gifts & Charity': ['kado', 'hadiah', 'gift', 'donasi', 'donation', 'sedekah', 'zakat', 'infaq', 'infak', 'amal', 'charity', 'kondangan', 'sumbangan', 'angpao'],
  Insurance: ['asuransi', 'insurance', 'bpjs', 'premi', 'prudential', 'allianz', 'axa', 'manulife'],
  'Loans & Credit': ['cicilan', 'kredit', 'credit card', 'kartu kredit', 'paylater', 'pay later', 'spaylater', 'gopaylater', 'kredivo', 'akulaku', 'pinjaman', 'loan', 'angsuran', 'utang', 'hutang', 'leasing'],
  Investments: ['reksadana', 'reksa dana', 'saham', 'stock', 'bibit', 'ajaib', 'bareksa', 'emas', 'gold', 'crypto', 'kripto', 'obligasi', 'sbn', 'deposito', 'investasi', 'invest'],
  'Bank Fees': ['biaya admin', 'admin bank', 'biaya transfer', 'biaya bank', 'bank fee', 'admin fee', 'transfer fee'],
  Salary: ['gaji', 'payroll', 'salary', 'upah', 'paycheck'],
  Bonus: ['bonus', 'thr', 'insentif', 'incentive', 'komisi', 'commission'],
  Business: ['jualan', 'orderan', 'order', 'penjualan', 'omzet', 'laba', 'sales', 'profit'],
  Freelance: ['freelance', 'project', 'proyek', 'fee', 'honor', 'honorarium', 'side job', 'upwork', 'fiverr'],
  Gifts: ['hadiah', 'kado', 'gift', 'angpao', 'transfer ortu', 'dikasih'],
  Refunds: ['refund', 'cashback', 'pengembalian', 'reimburse', 'reimbursement', 'klaim'],
  // 'Investments' (masuk): dividen, bunga
};
// Kata kunci tambahan untuk kategori yang namanya sama di kedua tipe (dipilih sesuai tipe transaksi)
CATEGORY_KEYWORDS.Investments.push('dividen', 'dividend', 'bunga', 'interest', 'kupon');
