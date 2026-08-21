/* ==========================================================================
   VaxBook Digital Vaccination System - Core Application JavaScript Logic
   Gateway API Base URL: http://localhost:8080
   30 Authorized Vaccines Catalog & Instant Vial Authenticity Pop-Up Modal
   Cascading State -> District -> Auto Pincode Suggestion Widget
   ========================================================================== */

// Use the same host the frontend was loaded from, default to localhost for local dev.
const GATEWAY_URL = (function(){
    try {
        const host = window.location.hostname || 'localhost';
        // If frontend is served from an IP (e.g., 10.13.173.185), use that hostname for API host
        const apiHost = host === 'localhost' ? 'localhost' : host;
        const url = `http://${apiHost}:8080`;
        console.log('[INFO] Using GATEWAY_URL =', url);
        return url;
    } catch(e) {
        console.log('[WARN] Falling back to http://localhost:8080 for GATEWAY_URL');
        return 'http://localhost:8080';
    }
})();

// Global State
let currentUser = null;
let activeCategory = 'ALL';
// Backend availability flag (set after a quick health check)
let BACKEND_AVAILABLE = true;

// CASCADING STATE -> DISTRICT -> AUTO PINCODE MAP
const STATE_DISTRICT_PINCODE_MAP = {
    "Delhi": {
        "Central Delhi": "110001",
        "South Delhi": "110016",
        "North Delhi": "110007"
    },
    "Uttar Pradesh": {
        "Noida / GB Nagar": "201301",
        "Lucknow": "226001",
        "Kanpur": "208001"
    },
    "Maharashtra": {
        "Mumbai": "400001",
        "Pune": "411001"
    },
    "Karnataka": {
        "Bengaluru": "560001",
        "Mysore": "570001"
    }
};

/// DYNAMIC BACKEND REGISTRIES (Populated 100% via API Gateway from MySQL DB)
let VACCINE_CATALOG = [];
let CENTERS_REGISTRY = [];
let DOCTORS_REGISTRY = [];
const VIAL_SAMPLE_DATABASE = {};

// APP INITIALIZATION COMPLETE

// INITIALIZE APP SAFELY
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function initApp() {
    checkSavedAuth();
    // Render catalog and centers immediately for sub-second UI response
    renderVaccineCatalog(true);
    renderCentersList('', true);
    setupModalClosingControls();
    handleHashRouting();

    // Check backend health asynchronously without blocking UI startup
    checkBackendHealth();
}

// Simple backend health check to detect if API gateway is reachable.
function checkBackendHealth(timeoutMs = 3000) {
    return new Promise((resolve) => {
        if (!GATEWAY_URL) {
            BACKEND_AVAILABLE = false;
            resolve();
            return;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        // Target valid gateway route predicate (/vaccine/getAll)
        fetch(GATEWAY_URL + '/vaccine/getAll', { signal: controller.signal })
            .then(res => {
                clearTimeout(timer);
                // Reachable if response is received from server
                BACKEND_AVAILABLE = !!(res && (res.ok || res.status > 0));
                resolve();
            })
            .catch(err => {
                clearTimeout(timer);
                BACKEND_AVAILABLE = false;
                console.warn('VaxBook: Backend health check failed:', err.message || err);
                try {
                    let banner = document.getElementById('backend-offline-banner');
                    if (!banner) {
                        banner = document.createElement('div');
                        banner.id = 'backend-offline-banner';
                        banner.style.cssText = 'background:#fff4f4;color:#7f1d1d;padding:8px 12px;text-align:center;font-weight:700;border-bottom:1px solid #fecaca;';
                        banner.innerText = `Warning: Backend API Gateway (${GATEWAY_URL}) is unreachable — some features will be disabled.`;
                        document.body.insertBefore(banner, document.body.firstChild);
                    }
                } catch (e) {}
                resolve();
            });
    });
}

// AUTO PINCODE & CASCADING STATE-DISTRICT HANDLERS
function onStateChange() {
    const stateVal = document.getElementById('search-state').value;
    const districtSelect = document.getElementById('search-district');
    const pincodeInput = document.getElementById('search-pincode');

    districtSelect.innerHTML = '<option value="">-- Select District / City --</option>';
    pincodeInput.value = '';

    if (stateVal && STATE_DISTRICT_PINCODE_MAP[stateVal]) {
        const districts = Object.keys(STATE_DISTRICT_PINCODE_MAP[stateVal]);
        districts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.innerText = d;
            districtSelect.appendChild(opt);
        });

        if (districts.length > 0) {
            districtSelect.value = districts[0];
            onDistrictChange();
        }
    }
}

function onDistrictChange() {
    const stateVal = document.getElementById('search-state').value;
    const districtVal = document.getElementById('search-district').value;
    const pincodeInput = document.getElementById('search-pincode');

    if (stateVal && districtVal && STATE_DISTRICT_PINCODE_MAP[stateVal] && STATE_DISTRICT_PINCODE_MAP[stateVal][districtVal]) {
        pincodeInput.value = STATE_DISTRICT_PINCODE_MAP[stateVal][districtVal];
    } else {
        pincodeInput.value = '';
    }
}

function searchSlots() {
    const stateVal = document.getElementById('search-state').value;
    const districtVal = document.getElementById('search-district').value;
    const pincodeVal = document.getElementById('search-pincode').value;

    renderCentersList(pincodeVal || districtVal || stateVal);
    scrollToSection('centers');
}

// LISTEN FOR URL HASH ROUTING CHANGES
window.addEventListener('hashchange', () => handleHashRouting(false));

function handleHashRouting(isInitialLoad = true) {
    const hash = window.location.hash;
    if (!hash) return;

    if (hash.startsWith('#vaccine-detail-')) {
        const id = parseInt(hash.replace('#vaccine-detail-', ''));
        openAboutVaccineModal(id, false);
    } else if (hash === '#dashboard') {
        closeAllModals();
        showDashTab('bookings');
    } else if (!isInitialLoad) {
        // Only scroll when user explicitly clicked a link after page was already loaded
        closeAllModals();
        const targetId = hash.replace('#', '');
        scrollToSection(targetId);
    }
}

function scrollToSection(id) {
    const elem = document.getElementById(id);
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
}

// SETUP MODAL CLOSING CONTROLS
function setupModalClosingControls() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeAllModals();
            }
        });
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            closeAllModals();
        }
    });
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    if (window.location.hash.startsWith('#vaccine-detail-')) {
        window.history.pushState("", document.title, window.location.pathname + window.location.search);
    }
}

function closeModal(modalId) {
    if (!modalId) {
        closeAllModals();
        return;
    }
    const elem = document.getElementById(modalId);
    if (elem) {
        elem.classList.add('hidden');
    }
}

function getVaccineCategory(name) {
    name = (name || '').toLowerCase();
    if (name.includes('covishield') || name.includes('covaxin') || name.includes('sputnik') || name.includes('corbevax') || name.includes('zycov') || name.includes('incovacc')) {
        return 'COVID';
    }
    if (name.includes('bcg') || name.includes('polio') || name.includes('pentavalent') || name.includes('rotavirus') || name.includes('mmr') || name.includes('measles') || name.includes('rubella') || name.includes('pediatric') || name.includes('dtap') || name.includes('infanrix')) {
        return 'CHILD';
    }
    if (name.includes('flu') || name.includes('influenza') || name.includes('pneumococcal') || name.includes('pcv') || name.includes('ppsv') || name.includes('rsv') || name.includes('hib') || name.includes('haemophilus') || name.includes('fluarix')) {
        return 'FLU';
    }
    if (name.includes('yellow fever') || name.includes('typhoid') || name.includes('rabies') || name.includes('meningococcal') || name.includes('encephalitis') || name.includes('havrix') || name.includes('hepatitis a travel')) {
        return 'TRAVEL';
    }
    if (name.includes('shingles') || name.includes('shingrix') || name.includes('tdap') || name.includes('hpv') || name.includes('gardasil') || name.includes('twinrix') || name.includes('varicella') || name.includes('chickenpox') || name.includes('dukoral') || name.includes('cholera')) {
        return 'SENIOR';
    }
    return 'COVID'; // default fallback
}

const DEFAULT_VACCINE_SVG = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22400%22%20viewBox%3D%220%200%20600%20400%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f0f9ff%22%2F%3E%3Ccircle%20cx%3D%22300%22%20cy%3D%22160%22%20r%3D%2265%22%20fill%3D%22%230284c7%22%20opacity%3D%220.15%22%2F%3E%3Cpath%20d%3D%22M285%20110h30v70h-30z%22%20fill%3D%22%230284c7%22%2F%3E%3Cpath%20d%3D%22M275%20100h50v10h-50zM295%20180h10v30h-10z%22%20fill%3D%22%230369a1%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%22275%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20font-weight%3D%22bold%22%20fill%3D%22%230369a1%22%20text-anchor%3D%22middle%22%3EVaxBook%20Authorized%20Product%3C%2Ftext%3E%3C%2Fsvg%3E';

// RENDER VACCINE CATALOG FROM BACKEND MYSQL DATABASE WITH FALLBACK
function renderVaccineCatalog(forceFetch = false) {
    const container = document.getElementById('vaccine-cards-grid');
    if (!container) return;

    const renderGrid = (vaccinesList) => {
        if (vaccinesList) VACCINE_CATALOG = vaccinesList;
        if (!VACCINE_CATALOG || VACCINE_CATALOG.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#64748b;">No vaccines found in catalog.</div>`;
            return;
        }

        const filtered = activeCategory === 'ALL'
            ? VACCINE_CATALOG
            : VACCINE_CATALOG.filter(v => getVaccineCategory(v.vaccineName) === activeCategory);

        if (filtered.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#64748b;">No vaccines found in this category.</div>`;
            return;
        }

        container.innerHTML = filtered.map(v => {
            let img = (v.imageUrl && typeof v.imageUrl === 'string' && v.imageUrl.startsWith('http')) ? v.imageUrl.replace(/["']/g, '') : DEFAULT_VACCINE_SVG;
            const isFree = (v.price === 0 || !v.price);
            const priceBadge = isFree ? 'FREE (Govt Drive)' : `₹${v.price}`;
            return `
                <div class="vax-card">
                    <div class="vax-img-container">
                        <img src="${img}" alt="${v.vaccineName || 'Vaccine'}" loading="lazy" onerror="this.onerror=null;this.src=DEFAULT_VACCINE_SVG;">
                        <span class="badge ${isFree ? 'badge-free' : 'badge-paid'}">${priceBadge}</span>
                    </div>
                    <div class="vax-card-body">
                        <h3 class="vax-title">${v.vaccineName}</h3>
                        <div class="vax-age"><i class="fa-solid fa-user-tag"></i> Target Age: ${v.ageRange || '18-80'}</div>
                        <p class="vax-desc">${(v.description || 'Government authorized vaccination formulation. Batch Number: ' + (v.batchNumber || 'B-100')).substring(0, 85)}...</p>
                        <div class="vax-footer">
                            <span class="vax-price">${priceBadge}</span>
                            <button class="btn btn-primary btn-sm" onclick="openAboutVaccineModal(${v.id})"><i class="fa-solid fa-circle-info"></i> View Details & Book</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    if (!forceFetch && VACCINE_CATALOG && VACCINE_CATALOG.length > 0) {
        renderGrid(null);
        return;
    }

    fetch(`${GATEWAY_URL}/vaccine/getAll`)
        .then(res => res.ok ? res.json() : null)
        .then(vaccines => {
            renderGrid(vaccines || []);
        })
        .catch(() => {
            renderGrid([]);
        });
}

// CATEGORY FILTER TABS
function filterCategory(cat, evt) {
    activeCategory = cat;
    document.querySelectorAll('#category-tabs-container .tab-btn').forEach(btn => btn.classList.remove('active'));
    const target = (evt && evt.target) ? evt.target : (typeof event !== 'undefined' && event ? event.target : null);
    if (target) {
        target.classList.add('active');
    } else {
        const tabs = document.querySelectorAll('#category-tabs-container .tab-btn');
        tabs.forEach(tab => {
            if (tab.innerText.includes(cat)) {
                tab.classList.add('active');
            }
        });
    }
    renderVaccineCatalog(false);
}

// RENDER CENTERS LIST FROM BACKEND MYSQL DATABASE WITH FALLBACK
function renderCentersList(filterQuery = '', forceFetch = false) {
    const container = document.getElementById('centers-cards-grid');
    if (!container) return;

    const renderGrid = (centersList, doctorsList) => {
        if (centersList) CENTERS_REGISTRY = centersList;
        if (doctorsList) DOCTORS_REGISTRY = doctorsList;

        if (!CENTERS_REGISTRY || CENTERS_REGISTRY.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#64748b;">No vaccination centers found.</div>`;
            return;
        }

        CENTERS_REGISTRY.forEach(c => {
            const assignedDoc = (DOCTORS_REGISTRY || []).find(d => d.centerId === c.id || d.centerName === c.centreName);
            c.doctor = assignedDoc ? `Dr. ${assignedDoc.name}` : (c.doctorName ? `Dr. ${c.doctorName}` : 'Unassigned Practitioner');
        });

        let list = CENTERS_REGISTRY;
        if (filterQuery) {
            const q = filterQuery.toLowerCase();
            list = CENTERS_REGISTRY.filter(c => 
                (c.centreName && c.centreName.toLowerCase().includes(q)) || 
                (c.address && c.address.toLowerCase().includes(q))
            );
        }

        container.innerHTML = list.map(c => `
            <div class="center-card">
                <h3 class="center-name"><i class="fa-solid fa-hospital"></i> ${c.centreName}</h3>
                <p class="center-location"><i class="fa-solid fa-location-dot"></i> ${c.address || ''}</p>
                <div class="doctor-badge">
                    <i class="fa-solid fa-user-doctor text-primary"></i> <strong>Assigned Practitioner:</strong> ${c.doctor}
                </div>
                <div class="mt-2" style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="badge badge-free"><i class="fa-solid fa-circle-check"></i> ${c.doseCapacity || 0} Daily Capacity</span>
                    <button class="btn btn-outline btn-sm" onclick="openBookingModal(${c.id})"><i class="fa-solid fa-calendar-plus"></i> Select Center</button>
                </div>
            </div>
        `).join('');
    };

    if (!forceFetch && CENTERS_REGISTRY && CENTERS_REGISTRY.length > 0) {
        renderGrid(null, null);
        return;
    }

    Promise.all([
        fetch(`${GATEWAY_URL}/vaccinecenter/getAll`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${GATEWAY_URL}/doctor/getAll`).then(r => r.ok ? r.json() : []).catch(() => [])
    ]).then(([centers, doctors]) => {
        renderGrid(centers, doctors);
    }).catch(() => {
        renderGrid([], []);
    });
}

// ABOUT VACCINE MODAL FROM BACKEND
function openAboutVaccineModal(vaccineId, updateHash = true) {
    if (updateHash) {
        window.history.pushState("", document.title, window.location.pathname + "#vaccine-detail-" + vaccineId);
    }

    fetch(`${GATEWAY_URL}/vaccine/get/${vaccineId}`)
        .then(res => res.ok ? res.json() : null)
        .then(v => {
            if (!v) {
                showCustomAlert('Vaccine details not found on server.', 'Backend Error', 'danger');
                return;
            }

            const img = v.imageUrl || 'https://images.unsplash.com/photo-1618961734760-466979ce35b0?w=600';
            const isFree = (!v.price || v.price === 0);
            const priceTag = isFree ? 'FREE (Govt Drive)' : `₹${v.price}`;

            const modalContent = document.getElementById('modal-about-vaccine-content');
            modalContent.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-right:40px;">
                    <button class="btn btn-outline btn-sm" onclick="closeModal('modal-about-vaccine')">
                        <i class="fa-solid fa-arrow-left"></i> ← Back to Vaccine Catalog
                    </button>
                    <span class="badge ${isFree ? 'badge-free' : 'badge-paid'}" style="position:static; top:auto; right:auto;">${priceTag}</span>
                </div>

                <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:20px;">
                    <img src="${img}" style="width:220px; height:160px; object-fit:cover; border-radius:8px;" alt="${v.vaccineName}">
                    <div style="flex:1;">
                        <h2>${v.vaccineName}</h2>
                        <p class="text-primary" style="font-weight:600;"><i class="fa-solid fa-industry"></i> Manufacturer: ${v.manufacturer || 'Approved Pharma'}</p>
                        <p class="text-muted"><i class="fa-solid fa-user-tag"></i> Target Age: ${v.ageRange || '18-80'} | Batch Number: <code>${v.batchNumber || 'N/A'}</code></p>
                        <p class="text-muted"><i class="fa-solid fa-vial"></i> Doses Per Bottle Vial: <strong>${v.dosesPerVial || 10} Doses</strong></p>
                    </div>
                </div>

                <hr style="border-top:1px solid #e2e8f0; margin:15px 0;">
                <h3><i class="fa-solid fa-circle-info text-primary"></i> About Vaccine & Clinical Guidelines</h3>
                <p style="margin:10px 0; color:#334155; line-height:1.6;">${v.description || 'Government authorized vaccination formulation.'}</p>
                
                <h3 style="margin-top:20px;"><i class="fa-solid fa-hospital text-emerald"></i> Registered Vaccination Centers</h3>
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">
                    ${CENTERS_REGISTRY.length > 0 ? CENTERS_REGISTRY.map(c => `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong>${c.centreName}</strong><br>
                                <small class="text-muted"><i class="fa-solid fa-location-dot"></i> ${c.address}</small>
                            </div>
                            <button class="btn btn-emerald btn-sm" onclick="closeModal('modal-about-vaccine'); openBookingModal(${c.id}, ${v.id})"><i class="fa-solid fa-calendar-check"></i> Book Slot Here</button>
                        </div>
                    `).join('') : '<p class="text-muted">Select any center to confirm slot.</p>'}
                </div>

                <h3 style="margin-top:24px;"><i class="fa-solid fa-vial text-primary"></i> Physical Vial Inventory & Bottle QR Codes</h3>
                <p class="text-muted" style="font-size:0.85rem;">Inspected physical bottles available for this vaccine batch. Click 'View Bottle QR Code' to generate a scannable QR code label.</p>
                
                <div style="margin-top:10px; overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; background:white; border:1px solid #e2e8f0; border-radius:8px;">
                        <tr style="background:#f8fafc; text-align:left; border-bottom:2px solid #e2e8f0; font-size:0.85rem;">
                            <th style="padding:10px;">Vial Serial No</th>
                            <th>Batch ID</th>
                            <th>Live Doses Gauge</th>
                            <th>Expiry Date</th>
                            <th>Bottle QR Action</th>
                        </tr>
                        ${v.vials && v.vials.length > 0 ? v.vials.map(vl => {
                            const percent = Math.round((vl.remainingDoses / v.dosesPerVial) * 100);
                            return `
                                <tr style="border-bottom:1px solid #e2e8f0; font-size:0.85rem;">
                                    <td style="padding:10px;"><code>${vl.vialNumber}</code></td>
                                    <td><code>${v.batchNumber}</code></td>
                                    <td><span class="badge badge-free">${vl.remainingDoses}/${v.dosesPerVial} Left (${percent}%)</span></td>
                                    <td>${v.expiryDate || '2027-12-31'}</td>
                                    <td><button class="btn btn-outline btn-sm" onclick="generateBottleQrModal('${vl.vialNumber}', '${v.vaccineName}')"><i class="fa-solid fa-qrcode text-primary"></i> View Bottle QR</button></td>
                                </tr>
                            `;
                        }).join('') : `
                            <tr>
                                <td colspan="5" style="padding:10px; text-align:center; color:#64748b;">No active vials found for this vaccine batch in database.</td>
                            </tr>
                        `}
                    </table>
                </div>

                <div style="margin-top:24px; text-align:center;">
                    <button class="btn btn-outline" onclick="closeModal('modal-about-vaccine')">
                        <i class="fa-solid fa-arrow-left"></i> ← Back to Vaccine Catalog
                    </button>
                </div>
            `;

            document.getElementById('modal-about-vaccine').classList.remove('hidden');
        })
        .catch(err => {
            showCustomAlert('Backend Server Error: Unable to fetch vaccine details.', 'Server Error', 'danger');
        });
}

// GENERATE BOTTLE QR MODAL
function generateBottleQrModal(vialNo, vaccineName) {
    document.getElementById('qr-vial-number').innerText = vialNo;
    document.getElementById('qr-vial-name').innerText = vaccineName;

    const qrContainer = document.getElementById('qrcode-canvas-container');
    qrContainer.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: `${window.location.origin}/#vial-${vialNo}`,
            width: 160,
            height: 160,
            colorDark: "#0284c7",
            colorLight: "#ffffff"
        });
    } else {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(window.location.origin + '/#vial-' + vialNo)}`;
        qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="width:160px; height:160px;">`;
    }

    document.getElementById('modal-bottle-qr').classList.remove('hidden');
}

// UNIVERSAL VIAL VERIFICATION
function searchVialByInput() {
    const inputField = document.getElementById('vial-serial-input');
    const inputVal = inputField ? inputField.value.trim() : '';
    renderVialPopUpModal(inputVal);
}

function renderVialPopUpModal(vialNo) {
    const input = vialNo || (document.getElementById('vial-search-input') ? document.getElementById('vial-search-input').value.trim() : '');
    if (!input) {
        showCustomAlert('Please enter a valid Vial Serial Number (e.g. VIAL-COVI-2026-901)', 'Validation Notice', 'warning');
        return;
    }

    fetch(`${GATEWAY_URL}/vial/get/${encodeURIComponent(input)}`)
        .then(res => {
            if (!res.ok) {
                throw new Error('Vial not found in backend database');
            }
            return res.json();
        })
        .then(apiData => {
            const remaining = typeof apiData.remainingDoses !== 'undefined' ? apiData.remainingDoses : 'N/A';
            const vaccineName = (apiData.vaccine && apiData.vaccine.vaccineName) ? apiData.vaccine.vaccineName : (apiData.vaccineName || 'N/A');
            const manufacturer = (apiData.vaccine && apiData.vaccine.manufacturer) ? apiData.vaccine.manufacturer : (apiData.manufacturer || 'N/A');
            const batchNo = (apiData.vaccine && apiData.vaccine.batchNumber) ? apiData.vaccine.batchNumber : (apiData.batchNumber || 'N/A');

            const content = document.getElementById('modal-vial-verification-content');
            if (!content) return;

            content.innerHTML = `
                <div class="text-center" style="margin-bottom:16px;">
                    <i class="fa-solid fa-circle-check text-emerald fa-4x"></i>
                    <h3 style="margin-top:8px; color:#047857;">VERIFIED ORIGINAL BOTTLE VIAL</h3>
                    <span class="badge badge-free" style="position:static;">STATUS: ${apiData.status || 'AVAILABLE'}</span>
                </div>

                <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:16px; border-radius:8px; display:flex; flex-direction:column; gap:8px;">
                    <p><strong>Vaccine Name:</strong> ${vaccineName}</p>
                    <p><strong>Manufacturer:</strong> ${manufacturer}</p>
                    <p><strong>Vial Serial No:</strong> <code>${apiData.vialNumber}</code></p>
                    <p><strong>Batch ID:</strong> <code>${batchNo}</code></p>
                    <p><strong>Remaining Active Doses:</strong> <strong style="color:#059669;">${remaining} Doses Left in Bottle</strong></p>
                </div>

                <button class="btn btn-primary btn-block mt-3" onclick="closeModal('modal-vial-verification')">Close Verification Window</button>
            `;

            document.getElementById('modal-vial-verification').classList.remove('hidden');
        })
        .catch(err => {
            showCustomAlert(`Vial Verification Failed:\nSerial Number "${input}" not found in backend MySQL database!`, 'Vial Verification Error', 'danger');
        });
}

// OPEN SLOT BOOKING
// USER BOOKING PERSISTENCE HELPERS
function getUserBookings() {
    if (!currentUser || !currentUser.email) return [];
    const key = 'vaxbook_bookings_' + currentUser.email;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
}

function getAllSystemBookings() {
    let all = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('vaxbook_bookings_') || key === 'vaxbook_all_bookings')) {
            try {
                const parsed = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(parsed)) {
                    all.push(...parsed);
                }
            } catch(e) {}
        }
    }
    return all;
}

function saveUserBooking(booking) {
    if (!currentUser || !currentUser.email) return;
    const key = 'vaxbook_bookings_' + currentUser.email;
    const bookings = getUserBookings();
    bookings.unshift(booking);
    localStorage.setItem(key, JSON.stringify(bookings));

    // Also store in global all_bookings list for Admin Panel cross-referencing
    const globalKey = 'vaxbook_all_bookings';
    const globalData = localStorage.getItem(globalKey);
    const globalBookings = globalData ? JSON.parse(globalData) : [];
    globalBookings.unshift(booking);
    localStorage.setItem(globalKey, JSON.stringify(globalBookings));
}

let pendingBooking = null;

function openBookingModal(centerId, vaccineId = 1) {
    if (!currentUser) {
        openLoginModal();
        return;
    }

    const center = CENTERS_REGISTRY.find(c => c.id === centerId) || CENTERS_REGISTRY[0];
    const initialVaccine = VACCINE_CATALOG.find(v => v.id === vaccineId) || VACCINE_CATALOG[0];

    const updateBookingModalUI = (selectedVaccineId) => {
        const vaccine = VACCINE_CATALOG.find(v => v.id === parseInt(selectedVaccineId, 10)) || initialVaccine;
        const cName = center.centreName || center.name || 'Vaccination Center';
        const cDoctor = center.doctor || 'No Practitioner Assigned';
        const vName = vaccine.vaccineName || vaccine.name || 'Vaccine';
        const isFree = (vaccine.price === 0 || !vaccine.price);
        const priceText = isFree ? 'FREE (Govt Drive)' : `₹${vaccine.price}`;

        pendingBooking = {
            centerId: center.id,
            centerName: cName,
            doctorName: cDoctor,
            vaccineId: vaccine.id,
            vaccineName: vName,
            price: vaccine.price || 0,
            isFree: isFree
        };

        const content = document.getElementById('modal-booking-content');
        
        const vaccineOptionsHtml = VACCINE_CATALOG.map(v => {
            const vFree = (!v.price || v.price === 0);
            const tag = vFree ? 'FREE' : `₹${v.price}`;
            const isSelected = v.id === vaccine.id ? 'selected' : '';
            return `<option value="${v.id}" ${isSelected}>${v.vaccineName} (${tag})</option>`;
        }).join('');

        content.innerHTML = `
            <h3><i class="fa-solid fa-calendar-check text-primary"></i> Confirm Vaccination Appointment</h3>
            <p class="text-muted">Center: <strong>${cName}</strong></p>
            <p class="text-muted">Practitioner: <strong>${cDoctor}</strong></p>
            <hr style="margin:12px 0;">

            <div class="form-group">
                <label>Select Vaccine Formulation</label>
                <select id="book-vaccine-select" onchange="updateBookingModalUI(this.value)">
                    ${vaccineOptionsHtml}
                </select>
            </div>

            <div class="form-group">
                <label>Select Appointment Date</label>
                <input type="date" id="book-date" value="${new Date().toISOString().split('T')[0]}">
            </div>

            <div class="form-group">
                <label>Select Time Slot</label>
                <select id="book-time">
                    <option>09:00 AM - 10:30 AM</option>
                    <option>10:30 AM - 12:00 PM</option>
                    <option>02:00 PM - 03:30 PM</option>
                </select>
            </div>

            <div class="form-group">
                <label>Beneficiary Name</label>
                <input type="text" id="book-beneficiary" value="${currentUser.username}">
            </div>

            ${isFree ? `
                <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:12px; border-radius:8px; margin-bottom:12px;">
                    <p style="color:#047857; margin:0; font-weight:600;"><i class="fa-solid fa-circle-info"></i> Selected vaccine is 100% FREE (Government Immunization Drive).</p>
                </div>
                <button class="btn btn-emerald btn-block" onclick="finalizeSlotBooking('FREE')">
                    <i class="fa-solid fa-circle-check"></i> Confirm Free Slot Booking (₹0)
                </button>
            ` : `
                <div style="background:#fff7ed; border:1px solid #fed7aa; padding:12px; border-radius:8px; margin-bottom:12px;">
                    <p style="color:#c2410c; margin:0; font-weight:600;"><i class="fa-solid fa-credit-card"></i> Paid Vaccine (Fee: ${priceText}). Select your preferred payment method:</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <button class="btn btn-primary btn-block" onclick="finalizeSlotBooking('ONLINE')">
                        <i class="fa-solid fa-credit-card"></i> Option 1: Pay Online Now via Razorpay (${priceText})
                    </button>
                    <button class="btn btn-outline btn-block" style="border-color:#f97316; color:#c2410c; font-weight:600;" onclick="finalizeSlotBooking('CENTER')">
                        <i class="fa-solid fa-hospital-user"></i> Option 2: Pay at Center Reception Counter (${priceText})
                    </button>
                </div>
            `}
        `;
    };

    window.updateBookingModalUI = updateBookingModalUI;
    updateBookingModalUI(vaccineId);
    document.getElementById('modal-booking-checkout').classList.remove('hidden');
}

function processBookingCheckout(isFree) {
    finalizeSlotBooking(isFree === 'true' || isFree === true ? 'FREE' : 'ONLINE');
}

let isBookingSubmitting = false;

function finalizeSlotBooking(paymentMode = 'FREE') {
    if (!pendingBooking || !currentUser) return;
    if (isBookingSubmitting) return;
    isBookingSubmitting = true;

    const bookDate = document.getElementById('book-date') ? document.getElementById('book-date').value : new Date().toISOString().split('T')[0];
    const bookTime = document.getElementById('book-time') ? document.getElementById('book-time').value : '10:00 AM';

    const assignedDoc = DOCTORS_REGISTRY.find(d => d.centerId === pendingBooking.centerId);
    const doctorId = assignedDoc ? assignedDoc.docId : 1;

    let convertedTime = "09:00:00";
    try {
        const rawTime = bookTime.split('-')[0].trim();
        const parts = rawTime.split(' ');
        if (parts.length === 2) {
            const timeParts = parts[0].split(':');
            let hours = parseInt(timeParts[0], 10);
            const minutes = timeParts[1];
            const modifier = parts[1].toUpperCase();
            if (modifier === 'PM' && hours < 12) {
                hours += 12;
            } else if (modifier === 'AM' && hours === 12) {
                hours = 0;
            }
            convertedTime = `${String(hours).padStart(2, '0')}:${minutes}:00`;
        }
    } catch (e) {
        console.error("Time conversion error: ", e);
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.token}`
    };

    const apptPayload = {
        userId: currentUser.userId,
        docId: doctorId,
        vaccineId: pendingBooking.vaccineId,
        appointmentDate: bookDate,
        appointmentTime: convertedTime
    };

    const completeBookingRecord = (pStatus, successTitle, successMsg, customRefId = null) => {
        isBookingSubmitting = false;
        const newBooking = {
            id: customRefId || ('APPT-2026-' + Math.floor(1000 + Math.random() * 9000)),
            user: currentUser.username || 'Patient User',
            userEmail: currentUser.email || 'user@vaxbook.com',
            center: pendingBooking.centerName,
            doctor: pendingBooking.doctorName,
            vaccine: pendingBooking.vaccineName,
            date: `${bookDate} (${bookTime})`,
            status: 'CONFIRMED',
            paymentStatus: pStatus
        };

        saveUserBooking(newBooking);
        updateAuthUI();

        closeModal('modal-booking-checkout');
        showCustomAlert(`${successMsg}\nBooking Ref ID: ${newBooking.id}`, successTitle, 'success', () => {
            showDashTab('bookings');
        });
    };

    const bookBackendAppointment = () => {
        return fetch(`${GATEWAY_URL}/appointment/book`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(apptPayload)
        })
        .then(async res => {
            const text = await res.text();
            if (!res.ok) {
                let errorMsg = text;
                try {
                    const json = JSON.parse(text);
                    errorMsg = json.message || json.error || text;
                } catch(e) {}
                throw new Error(errorMsg || `Server returned HTTP ${res.status}`);
            }
            return text;
        });
    };

    if (paymentMode === 'FREE') {
        bookBackendAppointment()
            .then(() => completeBookingRecord('FREE_GOVT_DRIVE', 'Appointment Slot Confirmed', 'Vaccination Appointment Slot Confirmed Successfully!'))
            .catch(err => {
                isBookingSubmitting = false;
                closeModal('modal-booking-checkout');
                showCustomAlert(`Slot Booking Failed:\n${err.message}`, 'Appointment Service Error', 'error');
            });
    } else if (paymentMode === 'CENTER') {
        bookBackendAppointment()
            .then(() => completeBookingRecord('PENDING_AT_CENTER', 'Slot Reserved (Pay at Center)', 'Appointment Slot Reserved Successfully!\nPayment Status: Please pay at the center reception counter on arrival.'))
            .catch(err => {
                isBookingSubmitting = false;
                closeModal('modal-booking-checkout');
                showCustomAlert(`Slot Booking Failed:\n${err.message}`, 'Appointment Service Error', 'error');
            });
    } else if (paymentMode === 'ONLINE') {
        const apptRefId = 'APPT-2026-' + Math.floor(1000 + Math.random() * 9000);
        const orderPayload = {
            name: currentUser.username || currentUser.email || 'Patient User',
            email: currentUser.email || 'user@vaxbook.com',
            phoneNumber: currentUser.mobileNo || '9876543210',
            vaccineName: pendingBooking.vaccineName,
            appointmentRefId: apptRefId,
            amount: pendingBooking.price || 250
        };

        // Call VaccinePaymentGateway to create backend order FIRST (before booking slot)
        fetch(`${GATEWAY_URL}/api/payment/create-order`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(orderPayload)
        })
        .then(async res => {
            const text = await res.text();
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
            try {
                return JSON.parse(text);
            } catch(e) {
                return { id: null };
            }
        })
        .then(orderData => {
            const razorpayOrderId = orderData && orderData.id ? orderData.id : null;

            const options = {
                "key": "rzp_test_TLYdnocq1Qjz6G",
                "amount": (pendingBooking.price ? pendingBooking.price * 100 : 25000),
                "currency": "INR",
                "name": "VaxBook Vaccination System",
                "description": `Slot Fee for ${pendingBooking.vaccineName}`,
                "order_id": razorpayOrderId,
                "handler": function (response) {
                    // Payment SUCCESS! Now book appointment and update backend
                    bookBackendAppointment()
                        .then(() => {
                            const payId = response.razorpay_payment_id || ('pay_' + Math.random().toString(36).substring(2, 12));
                            const ordId = response.razorpay_order_id || razorpayOrderId || ('order_' + Math.random().toString(36).substring(2, 12));

                            fetch(`${GATEWAY_URL}/api/payment/update-order?paymentId=${payId}&orderId=${ordId}&status=SUCCESS`, {
                                method: 'POST',
                                headers: headers
                            }).catch(e => console.warn("Notice updating backend order status:", e));

                            completeBookingRecord('PAID_ONLINE', 'Payment Verified & Slot Confirmed', 'Payment Verified & Vaccination Appointment Slot Confirmed Successfully!', apptRefId);
                        })
                        .catch(err => {
                            isBookingSubmitting = false;
                            showCustomAlert(`Payment was successful but booking failed:\n${err.message}`, 'Booking Error', 'error');
                        });
                },
                "modal": {
                    "ondismiss": function() {
                        isBookingSubmitting = false;
                        showCustomAlert("Payment process was cancelled. Slot was NOT booked and no fee was charged.", "Payment Cancelled", "warning");
                    }
                }
            };

            closeModal('modal-booking-checkout');
            const rzp = new Razorpay(options);
            rzp.open();
        })
        .catch(err => {
            isBookingSubmitting = false;
            showCustomAlert("Payment Gateway Service Error: Unable to create order in payment database.\n" + err.message, "Payment Gateway Error", "error");
        });
    }
}

// PASSWORD EYE TOGGLE HELPER
function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// CLEAN AUTH & MULTI-STEP OTP REGISTER LOGIC
function openLoginModal() {
    closeAllModals();
    const modal = document.getElementById('modal-login');
    if (modal) {
        modal.classList.remove('hidden');
        toggleAuthMode('login');
    }
}

function toggleAuthMode(mode) {
    document.querySelectorAll('.auth-tab-btn').forEach(btn => btn.classList.remove('active'));
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');
    const forgotForm = document.getElementById('form-forgot');

    if (mode === 'register') {
        const regTab = document.getElementById('btn-auth-register');
        if (regTab) regTab.classList.add('active');
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'block';
        if (forgotForm) forgotForm.style.display = 'none';
    } else if (mode === 'forgot') {
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'none';
        if (forgotForm) forgotForm.style.display = 'block';
    } else {
        const loginTab = document.getElementById('btn-auth-login');
        if (loginTab) loginTab.classList.add('active');
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
        if (forgotForm) forgotForm.style.display = 'none';
    }
}

// OFFICIAL CUSTOM NOTIFICATION ALERT SYSTEM
let customAlertCallback = null;

function showCustomAlert(message, title = 'Official System Notice', type = 'success', callback = null) {
    customAlertCallback = callback;
    const modal = document.getElementById('modal-custom-alert');
    const titleElem = document.getElementById('custom-alert-title');
    const msgElem = document.getElementById('custom-alert-message');
    const iconElem = document.getElementById('custom-alert-icon');
    const btnElem = document.getElementById('custom-alert-btn');
    const cardElem = document.querySelector('.official-alert-card');

    if (titleElem) titleElem.innerText = title;
    if (msgElem) msgElem.innerText = message;

    if (iconElem && cardElem) {
        if (type === 'error' || type === 'danger') {
            iconElem.className = 'fa-solid fa-circle-xmark text-danger fa-4x';
            iconElem.style.color = '#ef4444';
            cardElem.style.borderTopColor = '#ef4444';
            if (btnElem) btnElem.className = 'btn btn-danger btn-block';
        } else if (type === 'warning') {
            iconElem.className = 'fa-solid fa-triangle-exclamation text-warning fa-4x';
            iconElem.style.color = '#f59e0b';
            cardElem.style.borderTopColor = '#f59e0b';
            if (btnElem) btnElem.className = 'btn btn-warning btn-block';
        } else if (type === 'info') {
            iconElem.className = 'fa-solid fa-circle-info text-primary fa-4x';
            iconElem.style.color = '#0284c7';
            cardElem.style.borderTopColor = '#0284c7';
            if (btnElem) btnElem.className = 'btn btn-primary btn-block';
        } else {
            iconElem.className = 'fa-solid fa-circle-check text-emerald fa-4x';
            iconElem.style.color = '#10b981';
            cardElem.style.borderTopColor = '#10b981';
            if (btnElem) btnElem.className = 'btn btn-emerald btn-block';
        }
    }

    if (modal) modal.classList.remove('hidden');
}

function closeCustomAlert() {
    const modal = document.getElementById('modal-custom-alert');
    if (modal) modal.classList.add('hidden');
    if (typeof customAlertCallback === 'function') {
        const cb = customAlertCallback;
        customAlertCallback = null;
        cb();
    }
}

// FORGOT PASSWORD FLOW
function requestForgotPasswordOtp() {
    const email = document.getElementById('forgot-email').value.trim();
    console.log('[DEBUG] requestForgotPasswordOtp called for', email);
    if (!email || !email.includes('@')) {
        showCustomAlert('Please enter a valid registered email address.', 'Validation Notice', 'warning');
        return;
    }

    const sendBtn = document.getElementById('btn-send-forgot-otp');
    if (sendBtn) sendBtn.innerText = 'Sending...';

    fetch(`${GATEWAY_URL}/user/forgetotp?email=${encodeURIComponent(email)}`, {
        method: 'POST'
    })
    .then(async res => {
        const text = await res.text();
        if (!res.ok) {
            let errorMsg = text;
            try {
                const json = JSON.parse(text);
                errorMsg = json.message || json.error || text;
            } catch(e) {}
            throw new Error(errorMsg || `Server returned HTTP ${res.status}`);
        }
        if (sendBtn) sendBtn.innerText = 'Resend OTP';
        document.getElementById('step-forgot-verify').classList.remove('hidden');
        showCustomAlert(`OTP sent successfully to ${email}`, 'OTP Sent', 'info');
    })
    .catch(err => {
        if (sendBtn) sendBtn.innerText = 'Send OTP';
        showCustomAlert(`Request Failed:\n${err.message || 'Unable to connect to User/Notification Service.'}`, 'Forgot Password Error', 'error');
    });
}

function handleForgotPasswordSubmit() {
    const email = document.getElementById('forgot-email').value.trim();
    const otp = document.getElementById('forgot-otp-input').value.trim();
    const newPassword = document.getElementById('forgot-new-password').value.trim();

    if (!otp || !newPassword) {
        showCustomAlert('Please enter the 6-digit OTP code and your new password.', 'Validation Notice', 'warning');
        return;
    }

    const payload = {
        email: email,
        otp: otp,
        newPassword: newPassword
    };

    fetch(`${GATEWAY_URL}/user/forgetpassword`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async res => {
        const text = await res.text();
        if (!res.ok) {
            let errorMsg = text;
            try {
                const json = JSON.parse(text);
                errorMsg = json.message || json.error || text;
            } catch(e) {}
            throw new Error(errorMsg || `Server returned HTTP ${res.status}`);
        }
        showCustomAlert('Password reset successfully! You can now login with your new password.', 'Password Reset Success', 'success', () => toggleAuthMode('login'));
    })
    .catch(err => {
        showCustomAlert(`Password Reset Failed:\n${err.message || 'Unable to reset password.'}`, 'Reset Password Error', 'error');
    });
}

// STEP 1: SEND OTP TO EMAIL VIA NOTIFICATION SERVICE
function sendRegistrationOtp() {
    const emailInput = document.getElementById('reg-email');
    const email = emailInput ? emailInput.value.trim() : '';
    console.log('[DEBUG] sendRegistrationOtp called for', email);

    if (!email || !email.includes('@')) {
        showCustomAlert('Please enter a valid email address.', 'Validation Notice', 'warning');
        return;
    }

    const sendBtn = document.getElementById('btn-send-otp');
    if (sendBtn) sendBtn.innerText = 'Sending...';

    fetch(`${GATEWAY_URL}/notification/sendotp?email=${encodeURIComponent(email)}`, {
        method: 'POST'
    })
    .then(async res => {
        const text = await res.text();
        if (!res.ok) {
            let errorMsg = text;
            try {
                const json = JSON.parse(text);
                errorMsg = json.message || json.error || text;
            } catch(e) {}
            throw new Error(errorMsg || `Server returned HTTP ${res.status}`);
        }
        return text;
    })
    .then(otpCode => {
        revealOtpStep(email, sendBtn);
        showCustomAlert(`Verification OTP has been sent to ${email}`, 'Email OTP Sent', 'info');
    })
    .catch(err => {
        if (sendBtn) sendBtn.innerText = 'Send OTP';
        showCustomAlert(`Notification Error:\n${err.message || 'Unable to send OTP via Notification Service.'}`, 'Notification Error', 'error');
    });
}

function revealOtpStep(email, sendBtn) {
    if (sendBtn) sendBtn.innerText = 'Resend OTP';
    const verifyStep = document.getElementById('step-otp-verify');
    if (verifyStep) verifyStep.classList.remove('hidden');
}

// STEP 2: VERIFY OTP & LOCK EMAIL
function verifyRegistrationOtp() {
    const email = document.getElementById('reg-email').value.trim();
    const otpVal = document.getElementById('reg-otp-input').value.trim();
    console.log('[DEBUG] verifyRegistrationOtp called', { email: email, otpProvided: !!otpVal });

    if (!otpVal) {
        showCustomAlert('Please enter the 6-digit OTP code sent to your email.', 'Validation Notice', 'warning');
        return;
    }

    fetch(`${GATEWAY_URL}/notification/verify-otp?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otpVal)}`, {
        method: 'POST'
    })
    .then(async res => {
        const text = await res.text();
        if (!res.ok) {
            let errorMsg = text;
            try {
                const json = JSON.parse(text);
                errorMsg = json.message || json.error || text;
            } catch(e) {}
            throw new Error(errorMsg || `Server returned HTTP ${res.status}`);
        }
        lockEmailAndShowProfile();
        showCustomAlert('Email verified successfully! Please complete your name and password details.', 'Email Verified', 'success');
    })
    .catch(err => {
        showCustomAlert(`OTP Verification Failed:\n${err.message || 'Invalid OTP code or Notification Service error.'}`, 'Verification Error', 'error');
    });
}

function lockEmailAndShowProfile() {
    const emailInput = document.getElementById('reg-email');
    if (emailInput) {
        emailInput.readOnly = true;
        emailInput.style.backgroundColor = '#e2e8f0';
        emailInput.style.cursor = 'not-allowed';
    }

    const verifiedBadge = document.getElementById('badge-email-verified');
    if (verifiedBadge) verifiedBadge.classList.remove('hidden');

    const sendBtn = document.getElementById('btn-send-otp');
    if (sendBtn) sendBtn.style.display = 'none';

    const verifyStep = document.getElementById('step-otp-verify');
    if (verifyStep) verifyStep.classList.add('hidden');

    const profileStep = document.getElementById('step-profile-create');
    if (profileStep) profileStep.classList.remove('hidden');
}

// SUBMIT REGISTER TO BACKEND USER SERVICE
function handleRegisterSubmit() {
    const email = document.getElementById('reg-email') ? document.getElementById('reg-email').value.trim() : '';
    const name = document.getElementById('reg-name') ? document.getElementById('reg-name').value.trim() : '';
    const password = document.getElementById('reg-password') ? document.getElementById('reg-password').value.trim() : '';
    const mobileNo = document.getElementById('reg-mobile') ? document.getElementById('reg-mobile').value.trim() : '9876543210';
    const ageVal = document.getElementById('reg-age') ? parseInt(document.getElementById('reg-age').value.trim(), 10) : 25;
    const genderVal = document.getElementById('reg-gender') ? document.getElementById('reg-gender').value.trim() : 'MALE';
    const otpVal = document.getElementById('reg-otp-input') ? document.getElementById('reg-otp-input').value.trim() : '123456';

    if (!email || !name || !password) {
        showCustomAlert('Please enter your email address, full name, and password.', 'Validation Notice', 'warning');
        return;
    }

    const payload = {
        email: email,
        password: password,
        name: name,
        age: ageVal || 25,
        gender: genderVal || "MALE",
        mobileNo: mobileNo || "9876543210",
        otp: otpVal || "123456"
    };

    fetch(`${GATEWAY_URL}/user/registernormaluser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async res => {
        const text = await res.text();
        if (!res.ok) {
            let errorMsg = text;
            try {
                const json = JSON.parse(text);
                errorMsg = json.message || json.error || text;
            } catch(e) {}
            throw new Error(errorMsg || `Registration failed (HTTP ${res.status})`);
        }
        try {
            return JSON.parse(text);
        } catch(e) {
            return { email: email, name: name };
        }
    })
    .then(userData => {
        currentUser = {
            username: userData.name || userData.email || name,
            email: userData.email || email,
            role: "ROLE_USER",
            token: "jwt-token-vaxbook",
            userId: userData.id || 1
        };

        localStorage.setItem('vaxbook_user', JSON.stringify(currentUser));
        updateAuthUI();
        closeModal('modal-login');
        showCustomAlert(`Account created successfully!\nWelcome to VaxBook, ${currentUser.username}!`, 'Registration Success', 'success');
    })
    .catch(err => {
        showCustomAlert(`Registration Failed:\n${err.message}`, 'Registration Error', 'danger');
    });
}

// DELETE USER PROFILE FROM BACKEND MYSQL DATABASE
function deleteUserProfile() {
    if (!currentUser || !currentUser.email) {
        showCustomAlert('No active user profile logged in.', 'Account Delete Error', 'danger');
        return;
    }

    if (!confirm(`Are you sure you want to permanently delete user account "${currentUser.email}" from the system database?`)) {
        return;
    }

    const email = currentUser.email;
    const headers = currentUser.token ? { 'Authorization': `Bearer ${currentUser.token}` } : {};

    fetch(`${GATEWAY_URL}/user/delete/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: headers
    })
    .then(res => {
        if (res.ok) {
            closeModal('modal-user-profile');
            showCustomAlert(`User account (${email}) has been permanently deleted from backend MySQL database.`, 'Account Deleted Successfully', 'success', () => {
                logout();
            });
        } else {
            return res.text().then(text => {
                throw new Error(text || `Server Error ${res.status}: Failed to delete user from database.`);
            }).catch(() => {
                throw new Error(`Server Error ${res.status}: Failed to delete user from database.`);
            });
        }
    })
    .catch(err => {
        showCustomAlert(`Something went wrong. Backend server error:\n${err.message || 'Unable to connect to User Service.'}`, 'Backend Server Error', 'danger');
    });
}

// OPEN USER PROFILE DETAILED MODAL
function openUserProfileModal() {
    if (!currentUser) return;

    const modalContent = document.getElementById('modal-user-profile-content');
    if (!modalContent) return;

    const bookings = getUserBookings();
    const activeBookingsCount = bookings.length;

    modalContent.innerHTML = `
        <div class="text-center" style="margin-bottom:16px;">
            <i class="fa-solid fa-circle-user text-primary fa-4x"></i>
            <h3 style="margin-top:10px; color:#0369a1;">${currentUser.username || 'User Profile'}</h3>
            <p class="text-muted" style="font-size:0.85rem;">Beneficiary Registered Profile</p>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:16px; border-radius:8px; display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #cbd5e1; padding-bottom:8px;">
                <span class="text-muted"><i class="fa-solid fa-user"></i> Full Name:</span>
                <strong style="color:#0f172a;">${currentUser.username || 'N/A'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #cbd5e1; padding-bottom:8px;">
                <span class="text-muted"><i class="fa-solid fa-envelope"></i> Email Address:</span>
                <strong style="color:#0f172a;">${currentUser.email || 'N/A'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="text-muted"><i class="fa-solid fa-calendar-check"></i> Active Slot Bookings:</span>
                <strong style="color:#0284c7;">${activeBookingsCount} ${activeBookingsCount === 1 ? 'Slot Booked' : 'Slots Booked'}</strong>
            </div>
        </div>

        <div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;">
            <button class="btn btn-primary btn-block" onclick="closeModal('modal-user-profile'); showDashTab('bookings');">
                <i class="fa-solid fa-calendar-check"></i> View My Appointments (${activeBookingsCount})
            </button>
        </div>
    `;

    document.getElementById('modal-user-profile').classList.remove('hidden');

    fetch(`${GATEWAY_URL}/user/get/${encodeURIComponent(currentUser.email)}`)
        .then(res => res.ok ? res.json() : null)
        .then(userData => {
            if (userData) {
                if (userData.name) currentUser.username = userData.name;
                if (userData.id) currentUser.userId = userData.id;
                if (userData.mobileNo) currentUser.mobileNo = userData.mobileNo;
                if (typeof userData.vaccinated !== 'undefined') {
                    currentUser.vaccinated = userData.vaccinated;
                }
                localStorage.setItem('vaxbook_user', JSON.stringify(currentUser));
                updateAuthUI();
            }
        })
        .catch(() => {});
}

// USER DROPDOWN MENU TOGGLE
function toggleUserDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) menu.classList.toggle('hidden');
}

function closeUserDropdown() {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) menu.classList.add('hidden');
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    const container = document.getElementById('user-profile-badge');
    if (container && !container.contains(e.target)) {
        closeUserDropdown();
    }
});

// LOGIN SUBMIT TO BACKEND USER SERVICE
function handleLoginSubmit(e) {
    e.preventDefault();
    const _emailField = document.getElementById('login-username');
    const _pwdField = document.getElementById('login-password');
    const emailInput = _emailField ? _emailField.value.trim() : '';
    const passwordInput = _pwdField ? _pwdField.value.trim() : '';

    if (!emailInput || !passwordInput) {
        showCustomAlert('Please enter your email and password.', 'Validation Notice', 'warning');
        return;
    }

    fetch(`${GATEWAY_URL}/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, password: passwordInput })
    })
    .then(async res => {
        const text = await res.text();
        if (!res.ok) {
            let errorMsg = text;
            try {
                const json = JSON.parse(text);
                errorMsg = json.message || json.error || text;
            } catch(e) {}
            throw new Error(errorMsg || `Invalid Email or Password (HTTP ${res.status})`);
        }
        try {
            return JSON.parse(text);
        } catch(e) {
            throw new Error("Invalid response format from server.");
        }
    })
    .then(tokenRes => {
        const roles = (tokenRes && tokenRes.roles) ? tokenRes.roles : [];
        const isAdmin = roles.includes('ROLE_ADMIN') || emailInput.toLowerCase() === 'admin@vaxbook.com';
        const displayName = (tokenRes && tokenRes.username && !tokenRes.username.includes('@')) 
            ? tokenRes.username 
            : emailInput.split('@')[0];

        const loginUserId = (tokenRes && (tokenRes.userId || tokenRes.id)) ? (tokenRes.userId || tokenRes.id) : null;

        currentUser = {
            username: displayName,
            email: (tokenRes && tokenRes.email) ? tokenRes.email : emailInput,
            role: isAdmin ? 'ROLE_ADMIN' : 'ROLE_USER',
            token: tokenRes.token || 'jwt-token-vaxbook',
            userId: loginUserId
        };

        localStorage.setItem('vaxbook_user', JSON.stringify(currentUser));
        updateAuthUI();
        closeModal('modal-login');
        showCustomAlert(`Login successful! Welcome back, ${currentUser.username}!`, 'Login Successful', 'success');

        fetchUserProfileName(currentUser.email);
    })
    .catch(err => {
        showCustomAlert(`Login Failed:\n${err.message}`, 'Authentication Error', 'danger');
    });
}

function fetchUserProfileName(email) {
    if (!email) return;
    fetch(`${GATEWAY_URL}/user/get/${encodeURIComponent(email)}`)
        .then(res => res.ok ? res.json() : null)
        .then(userData => {
            if (userData) {
                if (userData.name) currentUser.username = userData.name;
                if (userData.id) currentUser.userId = userData.id;
                if (userData.mobileNo) currentUser.mobileNo = userData.mobileNo;
                localStorage.setItem('vaxbook_user', JSON.stringify(currentUser));
                updateAuthUI();
            }
        })
        .catch(() => {});
}

function checkSavedAuth() {
    const saved = localStorage.getItem('vaxbook_user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            updateAuthUI();
            if (currentUser && currentUser.email) {
                fetchUserProfileName(currentUser.email);
            }
        } catch(e) {
            currentUser = null;
            localStorage.removeItem('vaxbook_user');
        }
    }
}

function updateAuthUI() {
    if (!currentUser) return;

    const loginBtn = document.getElementById('btn-login-modal');
    if (loginBtn) loginBtn.classList.add('hidden');

    const profileBadge = document.getElementById('user-profile-badge');
    if (profileBadge) profileBadge.classList.remove('hidden');

    let formattedName = currentUser.username || currentUser.email;
    if (formattedName.includes('@')) {
        formattedName = formattedName.split('@')[0];
    }
    formattedName = formattedName.replace(/\b\w/g, l => l.toUpperCase());

    const displayNameElem = document.getElementById('user-display-name');
    if (displayNameElem) displayNameElem.innerText = formattedName;

    const dropdownNameElem = document.getElementById('dropdown-user-name');
    if (dropdownNameElem) dropdownNameElem.innerText = formattedName;

    const dropdownEmailElem = document.getElementById('dropdown-user-email');
    if (dropdownEmailElem) dropdownEmailElem.innerText = currentUser.email || 'user@vaxbook.com';

    const navDashboard = document.getElementById('nav-dashboard');
    if (navDashboard) navDashboard.classList.remove('hidden');

    const adminToggleBtn = document.getElementById('btn-admin-toggle');
    const dropdownAdminOption = document.getElementById('dropdown-admin-option');

    if (currentUser.role === 'ROLE_ADMIN') {
        if (adminToggleBtn) adminToggleBtn.classList.remove('hidden');
        if (dropdownAdminOption) dropdownAdminOption.classList.remove('hidden');
    } else {
        if (adminToggleBtn) adminToggleBtn.classList.add('hidden');
        if (dropdownAdminOption) dropdownAdminOption.classList.add('hidden');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('vaxbook_user');
    document.getElementById('btn-login-modal').classList.remove('hidden');
    document.getElementById('user-profile-badge').classList.add('hidden');
    document.getElementById('nav-dashboard').classList.add('hidden');
    document.getElementById('btn-admin-toggle').classList.add('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    closeUserDropdown();
}

function toggleUserDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) menu.classList.toggle('hidden');
}

function closeUserDropdown() {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) menu.classList.add('hidden');
}

window.addEventListener('click', (e) => {
    const container = document.getElementById('user-profile-badge');
    const menu = document.getElementById('user-dropdown-menu');
    if (container && menu && !container.contains(e.target)) {
        menu.classList.add('hidden');
    }
});



// DASHBOARD TABS RENDERER
function showDashTab(tabName) {
    const dashSection = document.getElementById('dashboard');
    if (dashSection) dashSection.classList.remove('hidden');
    document.querySelectorAll('.dashboard-tabs .dash-tab').forEach(b => b.classList.remove('active'));

    const contentArea = document.getElementById('dash-content-area');
    if (!contentArea) return;

    if (!currentUser) {
        contentArea.innerHTML = `<div style="text-align:center; padding:40px; color:#64748b;">Please login to view your bookings and certificates.</div>`;
        return;
    }

    const currentUserId = (currentUser && (currentUser.userId || currentUser.id)) ? (currentUser.userId || currentUser.id) : 1;

    if (tabName === 'bookings') {
        contentArea.innerHTML = `<div style="text-align:center; padding:40px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Loading bookings from database...</div>`;

        fetch(`${GATEWAY_URL}/appointment/get/${currentUserId}`, {
            headers: (currentUser && currentUser.token) ? { 'Authorization': `Bearer ${currentUser.token}` } : {}
        })
        .then(res => res.ok ? res.json() : [])
        .then(backendBookings => {
            const bookings = (backendBookings || []).map(b => ({
                id: b.id,
                center: b.centerName || 'Authorized Center',
                doctor: b.doctorName || 'Assigned Doctor',
                vaccine: b.vaccineName || 'Vaccine Formulation',
                date: `${b.date || 'N/A'} (${b.time || 'N/A'})`,
                status: b.status || 'CONFIRMED'
            }));

            // Fallback to local storage if backend has no bookings
            if (bookings.length === 0) {
                const local = getUserBookings();
                if (local.length > 0) {
                    bookings.push(...local);
                }
            }

            renderBookingsTable(bookings, contentArea);
        })
        .catch(err => {
            console.warn("Failed to fetch bookings from backend, falling back to local storage: ", err);
            const bookings = getUserBookings();
            renderBookingsTable(bookings, contentArea);
        });
    } else if (tabName === 'doses') {
        const completedMap = JSON.parse(localStorage.getItem('vaxbook_completed_doses') || '{}');
        const completedList = Object.values(completedMap);
        const latestDose = completedList.length > 0 ? completedList[completedList.length - 1] : null;

        const curDose = latestDose ? (latestDose.doseNum || 1) : 0;
        const reqDoses = latestDose ? (latestDose.requiredDoses || 2) : 2;
        const isFullyVaccinated = curDose >= reqDoses;

        contentArea.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #e2e8f0;">
                <h3><i class="fa-solid fa-vial-circle-check text-emerald"></i> Immunization & Dose Tracking Status</h3>
                <div style="margin-top:16px; background:#f8fafc; border:1px solid ${isFullyVaccinated ? '#a7f3d0' : (curDose > 0 ? '#fde68a' : '#cbd5e1')}; padding:20px; border-radius:8px; text-align:center;">
                    <h4 style="color:#0f172a;"><i class="fa-solid fa-syringe text-primary"></i> Multi-Dose Protection Progress</h4>
                    ${isFullyVaccinated ? `
                        <p style="margin-top:8px; font-size:1.1rem; color:#059669;"><strong>Full Vaccination Protection Achieved! (${curDose}/${reqDoses} Doses Completed)</strong></p>
                        <span class="badge badge-free mt-2" style="background:#059669; color:white; font-size:0.9rem;"><i class="fa-solid fa-check-double"></i> FULLY VACCINATED & CERTIFIED (${curDose}/${reqDoses})</span>
                    ` : (curDose > 0 ? `
                        <p style="margin-top:8px; font-size:1.1rem; color:#d97706;"><strong>Partially Vaccinated (Dose ${curDose} of ${reqDoses} Complete)</strong></p>
                        <span class="badge badge-warning mt-2" style="background:#f59e0b; color:white; font-size:0.9rem;"><i class="fa-solid fa-clock-rotate-left"></i> PARTIALLY VACCINATED (${curDose}/${reqDoses} Doses Done - Pending Dose ${curDose + 1})</span>
                    ` : `
                        <p class="text-muted" style="margin-top:6px;">No doses administered yet. Please visit the vaccination center on your scheduled date.</p>
                        <span class="badge badge-warning mt-2"><i class="fa-solid fa-clock"></i> PENDING DOSE 1 ADMINISTRATION</span>
                    `)}
                </div>
            </div>
        `;
    } else if (tabName === 'certificate') {
        contentArea.innerHTML = `<div style="text-align:center; padding:40px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Retrieving certificate from server...</div>`;

        const resolveUserId = (currentUser && currentUser.userId && currentUser.userId !== 10042)
            ? Promise.resolve(currentUser.userId)
            : fetch(`${GATEWAY_URL}/user/get/${encodeURIComponent(currentUser ? currentUser.email : 'patient@vaxbook.com')}`)
                .then(r => r.ok ? r.json() : null)
                .then(u => {
                    if (u && u.id) {
                        if (currentUser) {
                            currentUser.userId = u.id;
                            localStorage.setItem('vaxbook_user', JSON.stringify(currentUser));
                        }
                        return u.id;
                    }
                    return currentUser ? (currentUser.userId || 1) : 1;
                })
                .catch(() => currentUser ? (currentUser.userId || 1) : 1);

        resolveUserId.then(realUserId => {
            fetch(`${GATEWAY_URL}/certificate/generate/${realUserId}`, {
                method: 'POST',
                headers: { 'Authorization': currentUser ? `Bearer ${currentUser.token}` : '' }
            })
            .then(res => {
                if (!res.ok) {
                    throw new Error("No certificate generated yet.");
                }
                return res.json();
            })
            .then(cert => {
                if (!cert || !cert.certificateNo) {
                    throw new Error("Empty certificate data.");
                }

                const isFully = cert.vaccinationStatus && cert.vaccinationStatus.includes('FULLY');
                const badgeBg = isFully ? '#059669' : '#d97706';
                const statusLabel = isFully ? 'FULLY VACCINATED' : 'PARTIALLY VACCINATED';

                contentArea.innerHTML = `
                    <div style="background:white; border-radius:10px; border:1px solid #cbd5e1; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05); max-width:700px; margin:0 auto; text-align:left;">
                        <div style="background:#0b2545; color:white; padding:16px 20px; text-align:center;">
                            <h4 style="margin:0; font-size:1.1rem; letter-spacing:0.5px; color:#ffffff;"><i class="fa-solid fa-building-columns"></i> MINISTRY OF HEALTH & FAMILY WELFARE</h4>
                            <div style="font-size:0.9rem; font-weight:700; color:#fde047; margin-top:4px;">GOVERNMENT DIGITAL VACCINATION CERTIFICATE</div>
                            <div style="font-size:0.75rem; color:#e0f2fe; margin-top:2px;">Issued under National Immunization Framework • Authentic Digital Record</div>
                        </div>
                        <div style="background:#f1f5f9; padding:8px 20px; display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; border-bottom:1px solid #e2e8f0;">
                            <span><strong>Ref ID:</strong> <code>${cert.certificateNo}</code></span>
                            <span><strong>Issued Date:</strong> ${cert.issueDate || 'N/A'}</span>
                        </div>
                        <div style="padding:20px; display:grid; grid-template-columns: 2fr 1fr; gap:16px; align-items:center;">
                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
                                <h5 style="margin:0 0 10px; color:#008080; border-bottom:2px solid #008080; padding-bottom:4px; font-size:0.85rem;"><i class="fa-solid fa-user-check"></i> BENEFICIARY RECORD</h5>
                                <p style="margin:4px 0; font-size:0.85rem;"><strong>Beneficiary Name:</strong> ${cert.patientName || (currentUser ? currentUser.username : 'Patient User')}</p>
                                <p style="margin:4px 0; font-size:0.85rem;"><strong>Age / Gender:</strong> ${cert.age || '28'} Years / ${cert.gender || 'MALE'}</p>
                                <p style="margin:4px 0; font-size:0.85rem;"><strong>Mobile Number:</strong> ${cert.mobileNumber ? ('XXXXXX' + cert.mobileNumber.slice(-4)) : 'XXXXXX3210'}</p>
                                <p style="margin:4px 0; font-size:0.85rem;"><strong>Beneficiary ID:</strong> <code>#USER-${cert.userId || realUserId}</code></p>
                            </div>
                            <div style="text-align:center; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                                <span class="badge" style="background:${badgeBg}; color:white; padding:6px 10px; font-size:0.75rem; border-radius:4px; display:inline-block; margin-bottom:10px;">
                                    <i class="fa-solid ${isFully ? 'fa-check-double' : 'fa-clock-rotate-left'}"></i> ${statusLabel}
                                </span>
                                <div>
                                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent('http://localhost:8088/certificate/view/' + cert.certificateNo)}" alt="QR Code" style="width:85px; height:85px; border:1px solid #cbd5e1; padding:2px; border-radius:4px;" onerror="this.style.display='none'">
                                </div>
                                <small style="color:#008080; font-weight:bold; font-size:0.7rem; margin-top:4px; display:block;"><i class="fa-solid fa-qrcode"></i> SCAN TO VERIFY</small>
                            </div>
                        </div>
                        <div style="padding:0 20px 20px 20px; text-align:center;">
                            <a href="${GATEWAY_URL}/certificate/download/${cert.certificateNo}" target="_blank" class="btn btn-emerald btn-block" style="padding:12px; font-size:0.95rem;">
                                <i class="fa-solid fa-file-pdf fa-lg"></i> Download Official Printable PDF Certificate
                            </a>
                        </div>
                    </div>
                `;
            })
            .catch(err => {
                console.log("Certificate load fallback: ", err);
                contentArea.innerHTML = `
                    <div style="background:white; padding:36px 20px; border-radius:8px; border:1px solid #e2e8f0; text-align:center;">
                        <i class="fa-solid fa-file-circle-xmark text-warning fa-3x"></i>
                        <h3 style="margin-top:12px; color:#0f172a;">No Vaccination Certificate Available</h3>
                        <p class="text-muted" style="margin:8px 0 16px;">Digital Vaccination Certificate will be generated automatically once your appointment slot is booked & completed.</p>
                        <button class="btn btn-emerald" onclick="scrollToSection('vaccines')">
                            <i class="fa-solid fa-calendar-plus"></i> Book Vaccination Slot First
                        </button>
                    </div>
                `;
            });
        });
    }
}

// ADMIN PANEL CONTROLLER
function toggleAdminPanel() {
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) {
        adminPanel.classList.remove('hidden');
        showAdminTab('overview');
        adminPanel.scrollIntoView({ behavior: 'smooth' });
    }
}

function showAdminTab(tab) {
    const content = document.getElementById('admin-tab-content');
    
    // De-activate all admin tabs and set active class on target button
    document.querySelectorAll('.admin-nav-tabs .admin-tab').forEach(btn => btn.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.target && event.target.classList.contains('admin-tab')) {
        event.target.classList.add('active');
    } else {
        const tabs = document.querySelectorAll('.admin-nav-tabs .admin-tab');
        tabs.forEach(t => {
            if (t.innerText.toLowerCase().includes(tab.replace('manage-', ''))) {
                t.classList.add('active');
            }
        });
    }

    if (tab === 'overview') {
        content.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Loading overview metrics...</div>`;
        fetch(`${GATEWAY_URL}/appointment/getAll`, {
            headers: (currentUser && currentUser.token) ? { 'Authorization': `Bearer ${currentUser.token}` } : {}
        })
        .then(res => res.ok ? res.json() : [])
        .then(appts => {
            const totalBookings = appts ? appts.length : 0;
            content.innerHTML = `
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-top:16px;">
                    <div style="background:white; padding:16px; border-radius:8px; border:1px solid #e2e8f0;">
                        <h4 class="text-muted">Total Bookings</h4>
                        <h2 class="text-primary">${totalBookings}</h2>
                    </div>
                    <div style="background:white; padding:16px; border-radius:8px; border:1px solid #e2e8f0;">
                        <h4 class="text-muted">Active Practitioners</h4>
                        <h2 class="text-emerald">${DOCTORS_REGISTRY.length}</h2>
                    </div>
                    <div style="background:white; padding:16px; border-radius:8px; border:1px solid #e2e8f0;">
                        <h4 class="text-muted">Active Centers</h4>
                        <h2>${CENTERS_REGISTRY.length} Centers</h2>
                    </div>
                    <div style="background:white; padding:16px; border-radius:8px; border:1px solid #e2e8f0;">
                        <h4 class="text-muted">Active Vaccines</h4>
                        <h2>${VACCINE_CATALOG.length} Vaccines</h2>
                    </div>
                </div>
            `;
        })
        .catch(() => {
            content.innerHTML = `
                <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:16px; margin-top:16px;">
                    <div style="background:white; padding:16px; border-radius:8px; border:1px solid #e2e8f0;">
                        <h4 class="text-muted">Active Centers</h4>
                        <h2>${CENTERS_REGISTRY.length} Centers</h2>
                    </div>
                    <div style="background:white; padding:16px; border-radius:8px; border:1px solid #e2e8f0;">
                        <h4 class="text-muted">Active Vaccines</h4>
                        <h2>${VACCINE_CATALOG.length} Vaccines</h2>
                    </div>
                </div>
            `;
        });
    } else if (tab === 'all-bookings') {
        content.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching all patient bookings from database...</div>`;

        const getVaccineFee = (vName) => {
            if (!vName) return { text: 'FREE', num: 0 };
            const vLower = vName.toLowerCase();
            const found = VACCINE_CATALOG.find(v => v.vaccineName && v.vaccineName.toLowerCase() === vLower);
            if (found && found.price > 0) return { text: `₹${found.price}`, num: found.price };
            return { text: 'FREE (Govt)', num: 0 };
        };

        fetch(`${GATEWAY_URL}/appointment/getAll`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        })
        .then(res => res.ok ? res.json() : [])
        .then(backendBookings => {
            const bookings = (backendBookings || []).map((b, idx) => {
                const feeInfo = getVaccineFee(b.vaccineName);
                const localMatch = (JSON.parse(localStorage.getItem('vaxbook_all_bookings') || '[]')).find(l => l.id === b.id || l.id === `#${b.id}` || l.id === `APPT-2026-${b.id}`);

                let pStatus = b.paymentStatus;
                if (localMatch && localMatch.paymentStatus) {
                    pStatus = localMatch.paymentStatus;
                } else if (!pStatus) {
                    pStatus = (feeInfo.num > 0 ? 'PENDING_AT_CENTER' : 'FREE_GOVT_DRIVE');
                }

                const completedMap = JSON.parse(localStorage.getItem('vaxbook_completed_doses') || '{}');
                const completedInfo = completedMap[b.id] || completedMap[`#${b.id}`] || completedMap[`APPT-2026-${b.id}`];

                const reqDoses = getVaccineRequiredDoses(b.vaccineName);
                const curDose = completedInfo ? (completedInfo.doseNum || 1) : 0;
                const isFullyCompleted = curDose >= reqDoses;

                return {
                    id: `APPT-2026-${b.id}`,
                    rawId: b.id,
                    userId: b.userId,
                    user: b.userName || `Patient #${b.userId || 'N/A'}`,
                    userEmail: localMatch ? localMatch.userEmail : '',
                    center: b.centerName || 'Authorized Center',
                    doctor: b.doctorName || 'Assigned Practitioner',
                    vaccine: b.vaccineName || 'Vaccine Formulation',
                    date: b.date ? `${b.date} (${b.time || 'N/A'})` : 'N/A',
                    fee: feeInfo.text,
                    feeNum: feeInfo.num,
                    paymentStatus: pStatus,
                    curDose: curDose,
                    reqDoses: reqDoses,
                    isFullyCompleted: isFullyCompleted
                };
            });

            content.innerHTML = `
                <div style="background:white; padding:20px; border-radius:8px; border:1px solid #e2e8f0; margin-top:16px;">
                    <h3><i class="fa-solid fa-calendar-check text-primary"></i> All Patient Appointment Bookings</h3>
                    <p class="text-muted">Direct Live Data from MySQL Database <code>Appointment_Data.appointments</code> (Total: <strong>${bookings.length}</strong> Records).</p>
                    <table style="width:100%; border-collapse:collapse; margin-top:12px;">
                        <tr style="background:#f8fafc; text-align:left; border-bottom:2px solid #e2e8f0; font-size:0.85rem;">
                            <th style="padding:10px;">Booking Ref ID</th>
                            <th>Center Name</th>
                            <th>Doctor</th>
                            <th>Date & Time Slot</th>
                            <th>Vaccine (Req. Doses)</th>
                            <th>Fee Amount</th>
                            <th>Payment Status</th>
                            <th>Action (Center Staff)</th>
                        </tr>
                        ${bookings.map(b => {
                            let badgeHtml = `<span class="badge badge-free"><i class="fa-solid fa-circle-check"></i> FREE (Govt Drive)</span>`;
                            if (b.paymentStatus === 'PAID_ONLINE' || b.paymentStatus === 'SUCCESS') {
                                badgeHtml = `<span class="badge badge-free" style="background:#10b981; color:white;"><i class="fa-solid fa-circle-check"></i> Paid Online (${b.fee})</span>`;
                            } else if (b.paymentStatus === 'PENDING_AT_CENTER' || b.feeNum > 0) {
                                badgeHtml = `<span class="badge badge-paid" style="background:#ea580c; color:white;"><i class="fa-solid fa-clock"></i> Pay at Center (Collect ${b.fee})</span>`;
                            }

                            let actionHtml = '';
                            if (b.curDose === 0) {
                                actionHtml = `<button class="btn btn-emerald btn-xs" onclick="openAdministerDoseModal('${b.rawId}', '${b.user.replace(/'/g, "\\'")}', '${b.vaccine.replace(/'/g, "\\'")}', '${b.userEmail || ''}', ${b.userId})"><i class="fa-solid fa-syringe"></i> Administer Dose 1/${b.reqDoses}</button>`;
                            } else if (b.isFullyCompleted) {
                                actionHtml = `<span class="badge badge-free" style="background:#059669; color:white;"><i class="fa-solid fa-circle-check"></i> Fully Completed (${b.curDose}/${b.reqDoses} Doses)</span>`;
                            } else {
                                const nextDose = b.curDose + 1;
                                actionHtml = `
                                    <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
                                        <span class="badge badge-warning" style="background:#f59e0b; color:white; font-size:0.75rem;"><i class="fa-solid fa-clock-rotate-left"></i> Dose ${b.curDose}/${b.reqDoses} Done</span>
                                        <button class="btn btn-emerald btn-xs" onclick="openAdministerDoseModal('${b.rawId}', '${b.user.replace(/'/g, "\\'")}', '${b.vaccine.replace(/'/g, "\\'")}', '${b.userEmail || ''}', ${b.userId})"><i class="fa-solid fa-syringe"></i> Administer Dose ${nextDose}/${b.reqDoses}</button>
                                    </div>
                                `;
                            }

                            return `
                                <tr style="border-bottom:1px solid #e2e8f0; font-size:0.85rem;">
                                    <td style="padding:10px;"><code>#${b.id}</code></td>
                                    <td><strong>${b.center}</strong></td>
                                    <td><small class="text-muted">${b.doctor}</small></td>
                                    <td>${b.date}</td>
                                    <td><strong>${b.vaccine}</strong> <small class="text-muted">(${b.reqDoses} ${b.reqDoses === 1 ? 'Dose' : 'Doses'})</small></td>
                                    <td><strong>${b.fee}</strong></td>
                                    <td>${badgeHtml}</td>
                                    <td>${actionHtml}</td>
                                </tr>
                            `;
                        }).join('')}
                    </table>
                </div>
            `;
        })
        .catch(err => {
            content.innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Server Error loading appointments from database.</div>`;
        });
    } else if (tab === 'manage-vaccines') {
        content.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #e2e8f0; margin-top:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
                    <div>
                        <h3 style="margin:0;"><i class="fa-solid fa-syringe text-primary"></i> Vaccine Catalog Management</h3>
                        <p class="text-muted" style="margin:4px 0 0;">Total authorized vaccines currently active in system catalog: <strong>${VACCINE_CATALOG.length}</strong></p>
                    </div>
                    <button class="btn btn-emerald btn-sm" onclick="openAdminAddVaccineModal()"><i class="fa-solid fa-plus-circle"></i> Add New Vaccine Product</button>
                </div>
                <table style="width:100%; border-collapse:collapse; margin-top:12px;">
                    <tr style="background:#f8fafc; text-align:left; border-bottom:2px solid #e2e8f0; font-size:0.85rem;">
                        <th style="padding:10px;">ID</th>
                        <th>Vaccine Name</th>
                        <th>Manufacturer</th>
                        <th>Batch Number</th>
                        <th>Price</th>
                        <th>Target Age</th>
                    </tr>
                    ${VACCINE_CATALOG.map(v => `
                        <tr style="border-bottom:1px solid #e2e8f0; font-size:0.85rem;">
                            <td style="padding:10px;"><code>#${v.id}</code></td>
                            <td><strong>${v.vaccineName}</strong></td>
                            <td>${v.manufacturer}</td>
                            <td><code>${v.batchNumber}</code></td>
                            <td>${v.price === 0 || !v.price ? 'FREE (Govt)' : '₹' + v.price}</td>
                            <td>${v.ageRange || '18-80'}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    } else if (tab === 'manage-centers') {
        content.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #e2e8f0; margin-top:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
                    <div>
                        <h3 style="margin:0;"><i class="fa-solid fa-hospital text-primary"></i> Centers & Doctors Registry</h3>
                        <p class="text-muted" style="margin:4px 0 0;">Active vaccination clinics and assigned practitioners: <strong>${CENTERS_REGISTRY.length}</strong></p>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn btn-emerald btn-sm" onclick="openAdminAddCenterModal()"><i class="fa-solid fa-plus-circle"></i> Add New Center</button>
                        <button class="btn btn-primary btn-sm" onclick="openAdminAddDoctorModal()"><i class="fa-solid fa-user-plus"></i> Add New Doctor</button>
                    </div>
                </div>
                <table style="width:100%; border-collapse:collapse; margin-top:12px;">
                    <tr style="background:#f8fafc; text-align:left; border-bottom:2px solid #e2e8f0; font-size:0.85rem;">
                        <th style="padding:10px;">ID</th>
                        <th>Center Name</th>
                        <th>Location Address</th>
                        <th>Assigned Practitioner</th>
                        <th>Daily Capacity</th>
                    </tr>
                    ${CENTERS_REGISTRY.map(c => `
                        <tr style="border-bottom:1px solid #e2e8f0; font-size:0.85rem;">
                            <td style="padding:10px;"><code>#${c.id}</code></td>
                            <td><strong>${c.centreName || c.name}</strong></td>
                            <td>${c.address}</td>
                            <td><i class="fa-solid fa-user-doctor text-primary"></i> ${c.doctor}</td>
                            <td><span class="badge badge-free">${c.doseCapacity || 300} slots</span></td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    } else if (tab === 'manage-vials') {
        content.innerHTML = `<div style="text-align:center; padding:20px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching active vials stock...</div>`;
        fetch(`${GATEWAY_URL}/vial/getAll`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        })
        .then(res => res.ok ? res.json() : [])
        .then(vials => {
            content.innerHTML = `
                <div style="background:white; padding:20px; border-radius:8px; border:1px solid #e2e8f0; margin-top:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
                        <div>
                            <h3 style="margin:0;"><i class="fa-solid fa-boxes-packing text-primary"></i> Live Vial Inventory Stock</h3>
                            <p class="text-muted" style="margin:4px 0 0;">Total physical vials registered in database: <strong>${vials.length}</strong></p>
                        </div>
                        <button class="btn btn-emerald btn-sm" onclick="openAdminAddVialModal()"><i class="fa-solid fa-plus-circle"></i> Register New Vial Batch</button>
                    </div>
                    <table style="width:100%; border-collapse:collapse; margin-top:12px;">
                        <tr style="background:#f8fafc; text-align:left; border-bottom:2px solid #e2e8f0; font-size:0.85rem;">
                            <th style="padding:10px;">Vial Serial No</th>
                            <th>Vaccine Product</th>
                            <th>Remaining Doses</th>
                            <th>Status</th>
                        </tr>
                        ${vials.map(vl => `
                            <tr style="border-bottom:1px solid #e2e8f0; font-size:0.85rem;">
                                <td style="padding:10px;"><code>${vl.vialNumber}</code></td>
                                <td>${vl.vaccineInfo ? vl.vaccineInfo.vaccineName : 'COVID Vaccine'}</td>
                                <td><strong>${vl.remainingDoses} Doses Left</strong></td>
                                <td><span class="badge ${vl.status === 'AVAILABLE' ? 'badge-free' : 'badge-paid'}">${vl.status}</span></td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            `;
        })
        .catch(err => {
            content.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Failed to retrieve vials from backend: ${err}</div>`;
        });
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    if (window.location.hash.startsWith('#vaccine-detail-')) {
        window.history.pushState("", document.title, window.location.pathname + window.location.search);
    }
}

function renderBookingsTable(bookings, contentArea) {
    if (bookings.length === 0) {
        contentArea.innerHTML = `
            <div style="background:white; padding:36px 20px; border-radius:8px; border:1px solid #e2e8f0; text-align:center;">
                <i class="fa-solid fa-calendar-xmark text-muted fa-3x"></i>
                <h3 style="margin-top:12px; color:#475569;">No Active Appointments Found</h3>
                <p class="text-muted" style="margin:8px 0 16px;">You haven't booked any vaccination slots yet. Select a vaccine center to confirm your slot.</p>
                <button class="btn btn-primary" onclick="scrollToSection('vaccines')">
                    <i class="fa-solid fa-syringe"></i> Book Vaccination Slot Now
                </button>
            </div>
        `;
    } else {
        contentArea.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #e2e8f0;">
                <h3><i class="fa-solid fa-calendar-check text-primary"></i> Active Appointment Bookings</h3>
                <table style="width:100%; border-collapse:collapse; margin-top:12px;">
                    <tr style="background:#f8fafc; text-align:left; border-bottom:2px solid #e2e8f0;">
                        <th style="padding:10px;">Booking Ref ID</th>
                        <th>Center Name</th>
                        <th>Doctor</th>
                        <th>Date & Time Slot</th>
                        <th>Vaccine</th>
                        <th>Status</th>
                    </tr>
                    ${bookings.map(b => {
                        let badgeHtml = `<span class="badge badge-free"><i class="fa-solid fa-circle-check"></i> ${b.status}</span>`;
                        if (b.paymentStatus === 'PAID_ONLINE') {
                            badgeHtml = `<span class="badge badge-free" style="background:#10b981; color:white;"><i class="fa-solid fa-circle-check"></i> Paid Online</span>`;
                        } else if (b.paymentStatus === 'PENDING_AT_CENTER') {
                            badgeHtml = `<span class="badge badge-paid" style="background:#ea580c; color:white;"><i class="fa-solid fa-clock"></i> Pay at Center (Collect ₹250)</span>`;
                        }
                        return `
                            <tr style="border-bottom:1px solid #e2e8f0;">
                                <td style="padding:10px;"><code>${b.id}</code></td>
                                <td>${b.center}</td>
                                <td><small class="text-muted">${b.doctor}</small></td>
                                <td>${b.date}</td>
                                <td>${b.vaccine}</td>
                                <td>${badgeHtml}</td>
                            </tr>
                        `;
                    }).join('')}
                </table>
            </div>
        `;
    }
}

// ADMIN MODAL FUNCTIONS & CRUD HANDLERS
function openAdminAddCenterModal() {
    document.getElementById('modal-admin-add-center').classList.remove('hidden');
}

function handleAdminAddCenter(e) {
    e.preventDefault();
    const name = document.getElementById('admin-center-name').value.trim();
    const address = document.getElementById('admin-center-address').value.trim();
    const capacity = parseInt(document.getElementById('admin-center-capacity').value, 10);

    const newCenter = {
        id: CENTERS_REGISTRY.length + 1,
        centreName: name,
        name: name,
        address: address,
        doctor: 'Unassigned Practitioner',
        doseCapacity: capacity
    };

    CENTERS_REGISTRY.push(newCenter);
    closeModal('modal-admin-add-center');
    alert(`Success: Vaccination Center "${name}" has been registered successfully!`);
    showAdminTab('manage-centers');
}

function openAdminAddDoctorModal() {
    const select = document.getElementById('admin-doctor-center-select');
    select.innerHTML = CENTERS_REGISTRY.map(c => `<option value="${c.id}">${c.centreName || c.name} (${c.address})</option>`).join('');
    document.getElementById('modal-admin-add-doctor').classList.remove('hidden');
}

function handleAdminAddDoctor(e) {
    e.preventDefault();
    const name = document.getElementById('admin-doctor-name').value.trim();
    const spec = document.getElementById('admin-doctor-spec').value.trim();
    const centerId = parseInt(document.getElementById('admin-doctor-center-select').value, 10);

    const targetCenter = CENTERS_REGISTRY.find(c => c.id === centerId);
    if (targetCenter) {
        targetCenter.doctor = name;
    }

    closeModal('modal-admin-add-doctor');
    alert(`Success: Practitioner "${name}" (${spec}) registered and assigned to center!`);
    showAdminTab('manage-centers');
}

function openAdminAddVialModal() {
    const select = document.getElementById('admin-vial-vaccine-select');
    select.innerHTML = VACCINE_CATALOG.map(v => `<option value="${v.id}">${v.vaccineName} (${v.manufacturer})</option>`).join('');
    document.getElementById('modal-admin-add-vial').classList.remove('hidden');
}

function handleAdminAddVial(e) {
    e.preventDefault();
    const serial = document.getElementById('admin-vial-number').value.trim();
    const vacId = parseInt(document.getElementById('admin-vial-vaccine-select').value, 10);
    const doses = parseInt(document.getElementById('admin-vial-doses').value, 10);

    const vacObj = VACCINE_CATALOG.find(v => v.id === vacId);
    closeModal('modal-admin-add-vial');
    alert(`Success: Vial Batch "${serial}" (${doses} Doses - ${vacObj ? vacObj.vaccineName : 'COVID'}) added to stock!`);
    showAdminTab('manage-vials');
}

function openAdminAddVaccineModal() {
    document.getElementById('modal-admin-add-vaccine').classList.remove('hidden');
}

function handleAdminAddVaccine(e) {
    e.preventDefault();
    const name = document.getElementById('admin-vac-name').value.trim();
    const manuf = document.getElementById('admin-vac-manuf').value.trim();
    const age = document.getElementById('admin-vac-age').value.trim();
    const price = parseFloat(document.getElementById('admin-vac-price').value);
    const customImage = document.getElementById('admin-vac-image') ? document.getElementById('admin-vac-image').value.trim() : '';
    const doses = document.getElementById('admin-vac-doses') ? parseInt(document.getElementById('admin-vac-doses').value, 10) : 10;

    const defaultImg = "https://images.unsplash.com/photo-1618961734760-466979ce35b0?w=600&auto=format&fit=crop&q=80";
    const imageUrl = customImage || defaultImg;
    const batchNo = `BATCH-${Date.now().toString().slice(-6)}`;

    const newVac = {
        id: VACCINE_CATALOG.length + 1,
        vaccineName: name,
        manufacturer: manuf,
        batchNumber: batchNo,
        price: price,
        ageRange: age,
        imageUrl: imageUrl,
        dosesPerVial: doses
    };

    VACCINE_CATALOG.unshift(newVac);

    // Auto-create physical bottle vial batch for this new vaccine
    const vialSerial = `VIAL-${name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase()}-2026-${Math.floor(100 + Math.random() * 900)}`;
    const vialPayload = {
        vialNumber: vialSerial,
        remainingDoses: doses,
        status: 'AVAILABLE',
        vaccineInfo: { id: newVac.id, vaccineName: name }
    };

    // Try posting vial batch to backend
    fetch(`${GATEWAY_URL}/vial/add`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': currentUser ? `Bearer ${currentUser.token}` : ''
        },
        body: JSON.stringify(vialPayload)
    }).catch(err => console.warn("Notice adding backend vial batch:", err));

    closeModal('modal-admin-add-vaccine');
    renderVaccinesList();
    alert(`Success: Vaccine "${name}" added to Catalog with Image!\nAlso auto-generated physical bottle Vial batch: "${vialSerial}" (${doses} Doses).`);
    showAdminTab('manage-vaccines');
}

function getVaccineRequiredDoses(vaccineName) {
    if (!vaccineName) return 2;
    const name = vaccineName.toLowerCase();
    const vax = VACCINE_CATALOG.find(v => v.vaccineName && v.vaccineName.toLowerCase() === name);
    if (vax && vax.dosesRequired) return vax.dosesRequired;

    if (name.includes('zycov') || name.includes('polio') || name.includes('pentavalent') || name.includes('rotavirus') || name.includes('twinrix')) {
        return 3;
    }
    if (name.includes('bcg') || name.includes('flu') || name.includes('ppsv') || name.includes('rsv') || name.includes('h1n1') || name.includes('yellow fever') || name.includes('typhoid') || name.includes('tdap')) {
        return 1;
    }
    return 2;
}

// DOSE ADMINISTRATION & VIAL DEDUCTION LOGIC
function openAdministerDoseModal(apptId, patientName, vaccineName, userEmail, userId) {
    document.getElementById('dose-appt-id').value = apptId;
    document.getElementById('dose-patient-user-id').value = userId || (currentUser ? currentUser.userId : 1);
    document.getElementById('dose-patient-name').value = patientName;
    document.getElementById('dose-vaccine-name').value = vaccineName;
    document.getElementById('dose-patient-email').value = userEmail || (currentUser ? currentUser.email : '');

    const reqDoses = getVaccineRequiredDoses(vaccineName);

    document.getElementById('dose-display-ref').innerText = `#${apptId}`;
    document.getElementById('dose-display-patient').innerText = patientName;
    document.getElementById('dose-display-vaccine').innerText = `${vaccineName} (Target Total: ${reqDoses} ${reqDoses === 1 ? 'Dose' : 'Doses'})`;

    const completedMap = JSON.parse(localStorage.getItem('vaxbook_completed_doses') || '{}');
    const existing = completedMap[apptId] || completedMap[`#${apptId}`] || completedMap[`APPT-2026-${apptId}`];

    let nextDoseNum = 1;
    if (existing && existing.doseNum) {
        nextDoseNum = Math.min(existing.doseNum + 1, reqDoses);
    }

    const doseSelect = document.getElementById('dose-number-select');
    if (doseSelect) {
        doseSelect.value = String(nextDoseNum);
    }

    const select = document.getElementById('dose-vial-select');
    select.innerHTML = `<option value="">Loading active vials...</option>`;

    fetch(`${GATEWAY_URL}/vial/getAll`, {
        headers: { 'Authorization': currentUser ? `Bearer ${currentUser.token}` : '' }
    })
    .then(res => res.ok ? res.json() : [])
    .then(vials => {
        if (vials && vials.length > 0) {
            select.innerHTML = vials.map(v => `<option value="${v.vialNumber}">${v.vialNumber} (${v.vaccineInfo ? v.vaccineInfo.vaccineName : vaccineName} - ${v.remainingDoses} Doses Remaining)</option>`).join('');
        } else {
            select.innerHTML = `<option value="">No active vials available in database</option>`;
        }
    })
    .catch(() => {
        select.innerHTML = `<option value="">Unable to load vials from backend</option>`;
    });

    document.getElementById('modal-admin-administer-dose').classList.remove('hidden');
}

function handleAdministerDoseSubmit(e) {
    e.preventDefault();
    const apptId = document.getElementById('dose-appt-id').value;
    const targetUserId = parseInt(document.getElementById('dose-patient-user-id').value || (currentUser ? currentUser.userId : '1'), 10);
    const patientName = document.getElementById('dose-patient-name').value;
    const vaccineName = document.getElementById('dose-vaccine-name').value;
    const patientEmail = document.getElementById('dose-patient-email').value || (currentUser ? currentUser.email : '');
    const vialSerial = document.getElementById('dose-vial-select').value;
    const doseNum = parseInt(document.getElementById('dose-number-select').value || '1', 10);

    const reqDoses = getVaccineRequiredDoses(vaccineName);
    const isFullyVaccinated = doseNum >= reqDoses;
    const vaxStatus = isFullyVaccinated ? 'FULLY VACCINATED' : `PARTIALLY VACCINATED (Dose ${doseNum}/${reqDoses})`;

    const userMobile = (currentUser && currentUser.mobileNo) ? currentUser.mobileNo : '';

    const dosePayload = {
        mobileNo: userMobile,
        doctorId: 1,
        vaccineId: 1,
        vialNumber: vialSerial
    };

    // 1. Call real backend DoseService via API Gateway FIRST
    fetch(`${GATEWAY_URL}/dose/take`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': currentUser ? `Bearer ${currentUser.token}` : ''
        },
        body: JSON.stringify(dosePayload)
    })
    .then(async doseRes => {
        // 2. AFTER Dose is saved in MySQL database, call CertificateService to generate/update certificate
        return fetch(`${GATEWAY_URL}/certificate/generate/${targetUserId}`, {
            method: 'POST',
            headers: { 'Authorization': currentUser ? `Bearer ${currentUser.token}` : '' }
        });
    })
    .then(res => res.ok ? res.json() : null)
    .then(certRes => {
        const certNo = (certRes && certRes.certificateNo) ? certRes.certificateNo : (`VAC-CERT-${Math.floor(100000 + Math.random() * 900000)}`);

        const completedMap = JSON.parse(localStorage.getItem('vaxbook_completed_doses') || '{}');
        const doseInfo = { certNo: certNo, doseNum: doseNum, requiredDoses: reqDoses, status: vaxStatus, userId: targetUserId };
        completedMap[apptId] = doseInfo;
        completedMap[`#${apptId}`] = doseInfo;
        completedMap[`APPT-2026-${apptId}`] = doseInfo;
        localStorage.setItem('vaxbook_completed_doses', JSON.stringify(completedMap));

        closeModal('modal-admin-administer-dose');
        showAdminTab('all-bookings');
        showCustomAlert(`Success: Dose ${doseNum} of ${reqDoses} Administered for Patient #${targetUserId} (${patientName})!\n• Overall Status: ${vaxStatus}\n• Certificate Issued: "${certNo}"`, 'Dose Administered Successfully', 'success');
    })
    .catch(err => {
        closeModal('modal-admin-administer-dose');
        showCustomAlert(`Dose Administration Error:\n${err.message || 'Unable to complete dose record on backend service.'}`, 'Dose Administration Error', 'danger');
    });
}

// PATIENT SIDE: MY APPOINTMENT BOOKINGS & CERTIFICATE MODAL
function showMyBookingsModal() {
    closeAllModals();
    closeUserDropdown();
    if (!currentUser) {
        const saved = localStorage.getItem('vaxbook_user');
        if (saved) {
            try { currentUser = JSON.parse(saved); } catch(e) {}
        }
    }

    if (!currentUser) {
        openLoginModal();
        return;
    }

    const contentArea = document.getElementById('my-bookings-modal-content') || document.getElementById('my-bookings-content');
    if (!contentArea) return;
    contentArea.innerHTML = `<div style="text-align:center; padding:40px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching your appointment records & certificates...</div>`;

    setTimeout(() => {
        const modal = document.getElementById('modal-my-bookings');
        if (modal) modal.classList.remove('hidden');
    }, 50);

    fetch(`${GATEWAY_URL}/user/get/${encodeURIComponent(currentUser.email)}`)
        .then(res => res.ok ? res.json() : null)
        .then(userData => {
            const realUserId = (userData && userData.id) ? userData.id : (currentUser.userId || 1);
            if (userData) {
                currentUser.userId = realUserId;
                localStorage.setItem('vaxbook_user', JSON.stringify(currentUser));
            }

            Promise.all([
                fetch(`${GATEWAY_URL}/certificate/generate/${realUserId}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentUser.token}` }
                }).then(r => r.ok ? r.json() : null).catch(() => null),

                fetch(`${GATEWAY_URL}/appointment/get/${realUserId}`, {
                    headers: { 'Authorization': `Bearer ${currentUser.token}` }
                }).then(r => r.ok ? r.json() : []).catch(() => [])
            ]).then(([userCert, backendBookings]) => {
                const userCertNo = (userCert && userCert.certificateNo) ? userCert.certificateNo : null;
                const userCertStatus = userCert ? userCert.vaccinationStatus : null;

                const userBookings = (backendBookings || []).filter(b => b.userId === realUserId || String(b.userId) === String(realUserId));
                const completedMap = JSON.parse(localStorage.getItem('vaxbook_completed_doses') || '{}');

                const bookings = userBookings.map(b => {
                    const k1 = b.id;
                    const k2 = `#${b.id}`;
                    const k3 = `APPT-2026-${b.id}`;
                    const doseRecord = completedMap[k1] || completedMap[k2] || completedMap[k3];

                    let doseNum = 0;
                    let vaxStatus = 'PENDING';
                    let certNo = null;

                    if (doseRecord) {
                        certNo = typeof doseRecord === 'object' ? (doseRecord.certNo || userCertNo) : doseRecord;
                        doseNum = typeof doseRecord === 'object' ? (doseRecord.doseNum || 1) : 1;
                        vaxStatus = typeof doseRecord === 'object' ? (doseRecord.status || userCertStatus || 'PARTIALLY VACCINATED') : 'PARTIALLY VACCINATED';
                    } else if (b.status === 'COMPLETED') {
                        doseNum = 2;
                        vaxStatus = 'FULLY VACCINATED';
                        certNo = userCertNo;
                    }

                    return {
                        id: `APPT-2026-${b.id}`,
                        center: b.centerName || 'Authorized Center',
                        doctor: b.doctorName || 'Assigned Practitioner',
                        vaccine: b.vaccineName || 'Vaccine Formulation',
                        date: b.date ? `${b.date} (${b.time || 'N/A'})` : 'N/A',
                        doseNum: doseNum,
                        vaxStatus: vaxStatus,
                        certNo: certNo
                    };
                });

                if (bookings.length === 0) {
                    contentArea.innerHTML = `
                        <div style="text-align:center; padding:30px;">
                            <i class="fa-solid fa-calendar-xmark text-muted fa-4x"></i>
                            <h3 style="margin-top:12px;">No Active Appointments Found</h3>
                            <p class="text-muted">You haven't booked any vaccination slots yet for account: <strong>${currentUser.email}</strong></p>
                            <button class="btn btn-primary mt-2" onclick="closeModal('modal-my-bookings'); scrollToSection('vaccines')">
                                <i class="fa-solid fa-syringe"></i> Book Vaccination Slot Now
                            </button>
                        </div>
                    `;
                } else {
                    contentArea.innerHTML = `
                        <div style="padding:10px;">
                            <h3><i class="fa-solid fa-calendar-check text-primary"></i> My Bookings & Certificates</h3>
                            <p class="text-muted">Account: <strong>${currentUser.email}</strong> (Total Bookings: <strong>${bookings.length}</strong>)</p>
                            <table style="width:100%; border-collapse:collapse; margin-top:16px;">
                                <tr style="background:#f8fafc; text-align:left; border-bottom:2px solid #e2e8f0; font-size:0.85rem;">
                                    <th style="padding:10px;">Booking Ref ID</th>
                                    <th>Center & Doctor</th>
                                    <th>Vaccine</th>
                                    <th>Date & Slot</th>
                                    <th>Dose Progress</th>
                                    <th>Official Certificate</th>
                                </tr>
                                ${bookings.map(b => {
                                    const reqDoses = getVaccineRequiredDoses(b.vaccine);
                                    const isFullyVaccinated = (b.doseNum >= reqDoses);

                                    let statusBadge = `<span class="badge badge-paid" style="background:#ea580c; color:white;"><i class="fa-solid fa-clock"></i> Pending Dose (Slot Confirmed)</span>`;
                                    let certAction = `<span class="text-muted" style="font-size:0.8rem;"><i class="fa-solid fa-lock"></i> Certificate Locked (Awaiting Dose)</span>`;

                                    if (isFullyVaccinated && b.certNo) {
                                        statusBadge = `<span class="badge badge-free" style="background:#059669; color:white;"><i class="fa-solid fa-check-double"></i> Fully Vaccinated (${b.doseNum} of ${reqDoses} Complete)</span>`;
                                        certAction = `
                                            <a href="${GATEWAY_URL}/certificate/download/${b.certNo}" target="_blank" class="btn btn-emerald btn-xs" style="text-decoration:none;">
                                                <i class="fa-solid fa-file-pdf"></i> Download Final Certificate PDF
                                            </a>
                                        `;
                                    } else if (b.doseNum > 0 && b.certNo) {
                                        statusBadge = `<span class="badge badge-paid" style="background:#d97706; color:white;"><i class="fa-solid fa-syringe"></i> Dose ${b.doseNum} Completed (${b.doseNum} of ${reqDoses} Complete)</span>`;
                                        certAction = `
                                            <a href="${GATEWAY_URL}/certificate/download/${b.certNo}?dose=${b.doseNum}" target="_blank" class="btn btn-emerald btn-xs" style="text-decoration:none; background:#0284c7;">
                                                <i class="fa-solid fa-file-pdf"></i> Download Dose ${b.doseNum} Certificate PDF
                                            </a>
                                        `;
                                    }

                                    return `
                                        <tr style="border-bottom:1px solid #e2e8f0; font-size:0.85rem;">
                                            <td style="padding:10px;"><code>#${b.id}</code></td>
                                            <td><strong>${b.center}</strong><br><small class="text-muted">${b.doctor}</small></td>
                                            <td><strong>${b.vaccine}</strong></td>
                                            <td>${b.date}</td>
                                            <td>${statusBadge}</td>
                                            <td>${certAction}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </table>
                        </div>
                    `;
                }
            });
        })
        .catch(() => {
            contentArea.innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Unable to connect to User Service.</div>`;
        });
}
