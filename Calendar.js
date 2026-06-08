// Firebase Configuration and Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, getDoc, setDoc, deleteDoc, getDocs, serverTimestamp, query, orderBy, limit, writeBatch }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyAXJ-H6wh_8vI5f1_gTcIpMgoiqGzc3cMc",
    authDomain: "final-destination-calendar.firebaseapp.com",
    projectId: "final-destination-calendar",
    storageBucket: "final-destination-calendar.firebasestorage.app",
    messagingSenderId: "684548386292",
    appId: "1:684548386292:web:4b3933d57f4e352a2a1da1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Global Variables
let currentCalendar = null;
let currentUser = null;
let currentEventId = null;
let currentSelectedDay = null;
let currentEditingEvent = null;
let allEvents = [];
let allSchedules = [];
let allUserProfiles = {};
let myFriends = [];
let pendingRequests = [];
let sentRequests = [];
let isEventClick = false;
let isAdmin = false;
let adminViewEnabled = false;
let notifUnsubscribe = null;

// ==================== PUSH NOTIFICATION UI ====================

let pushBannerTimeout = null;

// Show toast message
function showToastMessage(message, type = "info") {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm';
    let borderColor = '#3b82f6';
    if (type === 'success') borderColor = '#22c55e';
    if (type === 'error') borderColor = '#ef4444';
    toast.style.cssText = `
        background: var(--card);
        color: var(--tp);
        border-left: 4px solid ${borderColor};
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease-out;
    `;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Check if user has dismissed or enabled notifications
async function shouldShowPushBanner() {
    const bannerDismissed = localStorage.getItem('pushBannerDismissed');
    if (bannerDismissed === 'true') return false;
    
    if (currentUser) {
        const userRef = doc(db, "users", currentUser.email);
        const userDoc = await getDoc(userRef);
        const pushEnabled = userDoc.data()?.pushEnabled;
        if (pushEnabled === true) return false;
    }
    return true;
}

// Show the non-intrusive banner
async function showPushBanner() {
    const banner = document.getElementById('pushBanner');
    const pushStatus = document.getElementById('pushStatusContainer');
    
    const shouldShow = await shouldShowPushBanner();
    if (!shouldShow) return;
    
    if (pushStatus && !pushStatus.classList.contains('hidden')) return;
    
    if (banner) {
        banner.classList.remove('hidden');
        if (pushBannerTimeout) clearTimeout(pushBannerTimeout);
        pushBannerTimeout = setTimeout(() => {
            banner.classList.add('hidden');
        }, 10000);
    }
}

// Hide banner temporarily
function hidePushBanner() {
    const banner = document.getElementById('pushBanner');
    if (banner) {
        banner.classList.add('hidden');
        if (pushBannerTimeout) clearTimeout(pushBannerTimeout);
    }
}

// Permanently dismiss banner
function permanentlyDismissPushBanner() {
    localStorage.setItem('pushBannerDismissed', 'true');
    hidePushBanner();
    showToastMessage("You can enable notifications later in profile settings", "info");
}

// Enable push notifications
async function enablePushNotifications() {
    if (!currentUser) return;
    
    try {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            const userRef = doc(db, "users", currentUser.email);
            await setDoc(userRef, { pushEnabled: true }, { merge: true });
            
            updatePushStatusUI(true);
            hidePushBanner();
            showToastMessage("Notifications enabled! 🎉", "success");
        } else {
            showToastMessage("You denied notification permissions", "info");
        }
    } catch (error) {
        console.error("Push notification error:", error);
        showToastMessage("Could not enable notifications", "error");
    }
}

// Update push status UI
function updatePushStatusUI(enabled) {
    const pushStatus = document.getElementById('pushStatusContainer');
    const enableBtn = document.getElementById('enablePushBtn');
    const enableDiv = enableBtn?.closest('.mb-4.p-3.rounded-lg.border');
    
    if (enabled) {
        if (pushStatus) pushStatus.classList.remove('hidden');
        if (enableDiv) enableDiv.classList.add('hidden');
        localStorage.removeItem('pushBannerDismissed');
    } else {
        if (pushStatus) pushStatus.classList.add('hidden');
        if (enableDiv) enableDiv.classList.remove('hidden');
    }
}

// ==================== THEME FUNCTIONS ====================

function setTheme(name) {
    document.body.setAttribute('data-theme', name);
    localStorage.setItem('selectedTheme', name);
    document.querySelectorAll('.theme-option-card').forEach(c => {
        c.style.border = c.getAttribute('data-theme') === name ? '2px solid white' : 'none';
    });
    if (currentCalendar) refreshCalendarData();
}

// ==================== AVATAR HELPERS ====================

function getDisplayName(email) {
    const profile = allUserProfiles[email];
    if (profile?.displayName) {
        return profile.displayName;
    }
    return email.split('@')[0];
}

function avatarHtml(email, size = 'sm') {
    const profile = allUserProfiles[email];
    const sizeClass = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
    
    if (profile?.photoURL) {
        return `<img src="${profile.photoURL}" class="${sizeClass} rounded-full object-cover flex-shrink-0" onerror="this.style.display='none'" alt="">`;
    }
    const displayName = getDisplayName(email);
    const initial = displayName.charAt(0).toUpperCase();
    return `<span class="${sizeClass} rounded-full flex-shrink-0 avatar-fallback" style="background:var(--bp);color:white;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;${size === 'sm' ? 'font-size:11px' : 'font-size:14px'}">${initial}</span>`;
}

async function loadAllUserProfiles() {
    const snap = await getDocs(collection(db, "userProfiles"));
    snap.forEach(d => { allUserProfiles[d.id] = d.data(); });
}

async function saveMyProfile(user) {
    const profile = { 
        displayName: user.displayName || user.email.split('@')[0], 
        photoURL: user.photoURL || '', 
        email: user.email 
    };
    await setDoc(doc(db, "userProfiles", user.email), profile);
    allUserProfiles[user.email] = profile;
}

async function updateDisplayName(email, newDisplayName) {
    const profileRef = doc(db, "userProfiles", email);
    await updateDoc(profileRef, { displayName: newDisplayName });
    allUserProfiles[email].displayName = newDisplayName;
    
    if (email === currentUser?.email) {
        document.getElementById('userDisplayName').innerText = newDisplayName;
        
        const myAvatar = document.getElementById('myAvatar');
        const avatarFallback = document.getElementById('avatarFallback');
        
        if (!allUserProfiles[email]?.photoURL && !currentUser.photoURL) {
            avatarFallback.innerText = newDisplayName.charAt(0).toUpperCase();
        }
    }
}

// ==================== NOTIFICATIONS ====================

async function createNotification(toEmail, title, message, type) {
    if (toEmail === currentUser?.email) return;
    
    await addDoc(collection(db, "notifications", toEmail, "items"), {
        title, message, type,
        read: false,
        createdAt: serverTimestamp()
    });
}

function subscribeToMyNotifications() {
    if (notifUnsubscribe) notifUnsubscribe();
    const q = query(
        collection(db, "notifications", currentUser.email, "items"),
        orderBy("createdAt", "desc"),
        limit(50)
    );
    notifUnsubscribe = onSnapshot(q, snap => {
        renderNotificationPanel(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

function renderNotificationPanel(notifs) {
    const badge = document.getElementById('notificationBadge');
    const list = document.getElementById('notificationList');
    const unread = notifs.filter(n => !n.read).length;

    if (badge) {
        badge.textContent = unread > 99 ? '99+' : unread;
        badge.classList.toggle('hidden', unread === 0);
    }

    if (!list) return;
    if (notifs.length === 0) {
        list.innerHTML = `<div class="text-center text-sm p-4" style="color:var(--ts)">No notifications yet</div>`;
        return;
    }

    list.innerHTML = notifs.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}">
            <div class="notif-title">${n.title}</div>
            <div class="notif-msg">${n.message}</div>
            <div class="notif-time">${formatTimeAgo(n.createdAt?.toDate?.() || new Date())}</div>
        </div>
    `).join('');
}

async function markAllNotifsAsRead() {
    const q = query(collection(db, "notifications", currentUser.email, "items"), orderBy("createdAt", "desc"), limit(50));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => { if (!d.data().read) batch.update(d.ref, { read: true }); });
    await batch.commit();
}

async function clearAllNotifs() {
    const q = query(collection(db, "notifications", currentUser.email, "items"), limit(50));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// ==================== FRIENDS FUNCTIONS ====================

function getRelevantSchedules() {
    if (!currentUser) return [];
    if (isAdmin && adminViewEnabled) return allSchedules;
    return allSchedules.filter(s => s.email === currentUser.email || myFriends.includes(s.email));
}

function getRelevantEvents() {
    if (!currentUser) return [];
    if (isAdmin && adminViewEnabled) return allEvents;
    return allEvents.filter(ev => {
        if (ev.createdBy === currentUser.email) return true;
        if (myFriends.includes(ev.createdBy)) return true;
        if (ev.isPublic === true) return true;
        return false;
    });
}
async function loadFriendsAndRequests() {
    if (!currentUser) return;
    const snap = await getDoc(doc(db, "users", currentUser.email));
    if (snap.exists()) {
        myFriends = snap.data().friends || [];
        pendingRequests = snap.data().pendingRequests || [];
        sentRequests = snap.data().sentRequests || [];
    } else {
        myFriends = pendingRequests = sentRequests = [];
        await setDoc(doc(db, "users", currentUser.email), { email: currentUser.email, friends: [], pendingRequests: [], sentRequests: [] });
    }
    updateFriendsUI();
    updateRequestsUI();
    updateRequestBadge();
    refreshCalendarData();
    updateStatsBar();
}

function updateRequestBadge() {
    const badge = document.getElementById('requestBadge');
    if (badge) badge.classList.toggle('hidden', pendingRequests.length === 0);
}

async function sendFriendRequest(toEmail) {
    if (toEmail === currentUser.email) { alert("You can't add yourself!"); return false; }
    if (myFriends.includes(toEmail)) { alert("Already friends!"); return false; }
    if (sentRequests.includes(toEmail)) { alert("Request already sent!"); return false; }
    const exists = allSchedules.some(s => s.email === toEmail);
    if (!exists) { alert(`${toEmail} hasn't logged in yet.`); return false; }

    await setDoc(doc(db, "users", currentUser.email), { email: currentUser.email, friends: myFriends, pendingRequests, sentRequests: [...sentRequests, toEmail] });
    const rec = await getDoc(doc(db, "users", toEmail));
    let recPending = rec.exists() ? (rec.data().pendingRequests || []) : [];
    if (!recPending.includes(currentUser.email)) recPending.push(currentUser.email);
    await setDoc(doc(db, "users", toEmail), { ...rec.data(), email: toEmail, pendingRequests: recPending });

    const myName = getDisplayName(currentUser.email);
    await createNotification(toEmail, '👥 Friend Request', `${myName} sent you a friend request!`, 'friend_request');

    alert(`Friend request sent to ${getDisplayName(toEmail)}!`);
    await loadFriendsAndRequests();
    return true;
}

async function acceptRequest(fromEmail) {
    const newFriends = [...myFriends, fromEmail];
    const newPending = pendingRequests.filter(e => e !== fromEmail);
    await setDoc(doc(db, "users", currentUser.email), { email: currentUser.email, friends: newFriends, pendingRequests: newPending, sentRequests });

    const senderSnap = await getDoc(doc(db, "users", fromEmail));
    let senderFriends = senderSnap.data()?.friends || [];
    let senderSent = (senderSnap.data()?.sentRequests || []).filter(e => e !== currentUser.email);
    if (!senderFriends.includes(currentUser.email)) senderFriends.push(currentUser.email);
    await setDoc(doc(db, "users", fromEmail), { ...senderSnap.data(), friends: senderFriends, sentRequests: senderSent });

    const myName = getDisplayName(currentUser.email);
    await createNotification(fromEmail, '🎉 Friend Request Accepted', `${myName} accepted your friend request!`, 'friend_accepted');

    alert(`You're now friends with ${getDisplayName(fromEmail)}!`);
    await loadFriendsAndRequests();
    refreshCalendarData();
}

async function declineRequest(fromEmail) {
    const newPending = pendingRequests.filter(e => e !== fromEmail);
    await setDoc(doc(db, "users", currentUser.email), { email: currentUser.email, friends: myFriends, pendingRequests: newPending, sentRequests });
    await loadFriendsAndRequests();
}

async function removeFriend(friendEmail) {
    if (!confirm(`Remove ${getDisplayName(friendEmail)}?`)) return;
    const newFriends = myFriends.filter(e => e !== friendEmail);
    await setDoc(doc(db, "users", currentUser.email), { email: currentUser.email, friends: newFriends, pendingRequests, sentRequests });
    const fSnap = await getDoc(doc(db, "users", friendEmail));
    if (fSnap.exists()) {
        await setDoc(doc(db, "users", friendEmail), { ...fSnap.data(), friends: (fSnap.data().friends || []).filter(e => e !== currentUser.email) });
    }
    await loadFriendsAndRequests();
    refreshCalendarData();
}

async function searchUser(searchTerm) {
    const resultDiv = document.getElementById('searchResult');
    searchTerm = searchTerm.trim().toLowerCase();
    
    if (!searchTerm) {
        resultDiv.innerHTML = `<div class="text-red-500 text-sm p-2 text-center">Please enter a name or email to search</div>`;
        resultDiv.classList.remove('hidden');
        return;
    }
    
    let foundUser = null;
    let foundBy = '';
    
    if (allSchedules.some(s => s.email.toLowerCase() === searchTerm)) {
        foundUser = allSchedules.find(s => s.email.toLowerCase() === searchTerm);
        foundBy = 'email';
    } else {
        for (const [email, profile] of Object.entries(allUserProfiles)) {
            const displayName = profile?.displayName || email.split('@')[0];
            if (displayName.toLowerCase().includes(searchTerm)) {
                foundUser = { email: email };
                foundBy = 'display name';
                break;
            }
        }
        
        if (!foundUser) {
            for (const schedule of allSchedules) {
                if (schedule.email.toLowerCase().includes(searchTerm)) {
                    foundUser = schedule;
                    foundBy = 'email (partial)';
                    break;
                }
            }
        }
    }
    
    const exists = foundUser !== null;
    
    if (!exists) {
        resultDiv.innerHTML = `<div class="text-red-500 text-sm p-2 text-center">❌ User not found. Try a different name or email.</div>`;
        resultDiv.classList.remove('hidden');
        return;
    }
    
    const email = foundUser.email;
    const isFriend = myFriends.includes(email);
    const sent = sentRequests.includes(email);
    const isMe = email === currentUser.email;
    let action = '';
    
    if (isMe) action = '<span class="text-gray-400 text-sm">👤 This is you</span>';
    else if (isFriend) action = '<span class="text-green-600 text-sm">✓ Friends</span>';
    else if (sent) action = '<span class="text-yellow-600 text-sm">⏳ Request sent</span>';
    else action = `<button onclick="window.sendFriendRequest('${email}')" class="text-white px-4 py-1 rounded text-sm" style="background:var(--bp)">Send Request</button>`;
    
    const profile = allUserProfiles[email];
    const displayName = profile?.displayName || email.split('@')[0];
    const emailDisplay = isMe ? `<br><span class="text-xs" style="color:var(--ts)">${email}</span>` : '';
    
    resultDiv.innerHTML = `
        <div class="flex justify-between items-center gap-3">
            <div class="flex items-center gap-2">
                ${avatarHtml(email, 'sm')}
                <div>
                    <span class="font-medium text-sm" style="color:var(--tp)">${displayName}</span>
                    ${emailDisplay}
                </div>
            </div>
            ${action}
        </div>
        ${foundBy !== 'email' && !isMe ? `<p class="text-xs text-gray-400 mt-2">Found by ${foundBy}: "${searchTerm}"</p>` : ''}
    `;
    resultDiv.classList.remove('hidden');
}

function updateFriendsUI() {
    const container = document.getElementById('friendsList');
    if (!container) return;
    if (myFriends.length === 0) {
        container.innerHTML = `<div class="text-center text-sm p-4" style="color:var(--ts)">No friends yet. Send some requests!</div>`;
        return;
    }
    container.innerHTML = myFriends.map(email => {
        const profile = allUserProfiles[email];
        const displayName = profile?.displayName || email.split('@')[0];
        return `<div class="friend-list-item flex justify-between items-center p-2 rounded-lg gap-2" style="background:rgba(0,0,0,0.03)">
            <div class="flex items-center gap-2">
                ${avatarHtml(email, 'sm')}
                <div>
                    <span class="text-sm font-medium" style="color:var(--tp)">${displayName}</span>
                </div>
            </div>
            <button onclick="window.removeFriend('${email}')" class="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 rounded flex-shrink-0">Remove</button>
        </div>`;
    }).join('');
}

function updateRequestsUI() {
    const container = document.getElementById('requestsList');
    if (!container) return;
    if (pendingRequests.length === 0) {
        container.innerHTML = `<div class="text-center text-sm p-4" style="color:var(--ts)">No pending requests</div>`;
        return;
    }
    container.innerHTML = pendingRequests.map(email => {
        const profile = allUserProfiles[email];
        const displayName = profile?.displayName || email.split('@')[0];
        return `<div class="request-list-item flex justify-between items-center p-2 rounded-lg gap-2" style="background:rgba(234,179,8,0.1)">
            <div class="flex items-center gap-2">
                ${avatarHtml(email, 'sm')}
                <div>
                    <span class="text-sm font-medium" style="color:var(--tp)">${displayName}</span>
                </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
                <button onclick="window.acceptRequest('${email}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs">Accept</button>
                <button onclick="window.declineRequest('${email}')" class="bg-gray-300 hover:bg-gray-400 text-gray-700 px-3 py-1 rounded text-xs">Decline</button>
            </div>
        </div>`;
    }).join('');
}

window.sendFriendRequest = sendFriendRequest;
window.acceptRequest = acceptRequest;
window.declineRequest = declineRequest;
window.removeFriend = removeFriend;

// ==================== CALENDAR FUNCTIONS ====================

function calculateDayColors() {
    if (!currentUser) return { youFree: {}, youBusy: {}, mutualFree: {}, everyoneFree: {} };
    const rel = getRelevantSchedules();
    const mine = rel.find(s => s.email === currentUser.email);
    const friends = rel.filter(s => s.email !== currentUser.email);
    const youFree = {}, youBusy = {}, mutualFree = {}, everyoneFree = {};
    
    (mine?.blocks || []).filter(b => b.type === 'free').forEach(b => youFree[b.date] = true);
    (mine?.blocks || []).filter(b => b.type === 'busy').forEach(b => youBusy[b.date] = true);
    
    for (const f of friends) {
        (f.blocks || []).filter(b => b.type === 'free').forEach(b => {
            if (youFree[b.date]) {
                if (!mutualFree[b.date]) mutualFree[b.date] = [];
                mutualFree[b.date].push(f.email);
            }
        });
    }
    for (const date in mutualFree) {
        if (friends.length > 0 && friends.every(f => (f.blocks || []).some(b => b.date === date && b.type === 'free'))) everyoneFree[date] = true;
    }
    return { youFree, youBusy, mutualFree, everyoneFree };
}

function buildScheduleBgEvents() {
    const bgEvents = [];
    const rel = getRelevantSchedules();
    const myFreeDates = new Set();
    const mine = rel.find(s => s.email === currentUser?.email);
    (mine?.blocks || []).filter(b => b.type === 'free').forEach(b => myFreeDates.add(b.date));
    for (const s of rel) {
        const isMe = s.email === currentUser?.email;
        for (const b of (s.blocks || [])) {
            if (isMe) {
                bgEvents.push({ start: `${b.date}T${b.from}`, end: `${b.date}T${b.to}`, display: 'background', color: b.type === 'busy' ? '#ef4444' : '#3b82f6', overlap: true });
            } else if (b.type === 'free' && myFreeDates.has(b.date)) {
                bgEvents.push({ start: `${b.date}T${b.from}`, end: `${b.date}T${b.to}`, display: 'background', color: '#eab308', overlap: true });
            }
        }
    }
    return bgEvents;
}

function applyDayHighlights() {
    const c = calculateDayColors();
    setTimeout(() => {
        document.querySelectorAll('.fc-daygrid-day').forEach(day => {
            const d = day.getAttribute('data-date');
            if (!d) return;
            
            const mine = allSchedules.find(s => s.email === currentUser?.email);
            const blocks = (mine?.blocks || []).filter(b => b.date === d);
            const freeBlocks = blocks.filter(b => b.type === 'free');
            const busyBlocks = blocks.filter(b => b.type === 'busy');
            const hasFree = freeBlocks.length > 0;
            const hasBusy = busyBlocks.length > 0;
            const hasFullDayFree = freeBlocks.some(b => b.from === '00:00' && b.to === '23:59');
            const hasFullDayBusy = busyBlocks.some(b => b.from === '00:00' && b.to === '23:59');
            
            const friends = getRelevantSchedules().filter(s => s.email !== currentUser?.email);
            let hasMutualFree = false;
            
            for (const freeBlock of freeBlocks) {
                for (const friend of friends) {
                    const friendBlocks = (friend.blocks || []).filter(b => b.date === d && b.type === 'free');
                    for (const friendBlock of friendBlocks) {
                        if (freeBlock.from < friendBlock.to && friendBlock.from < freeBlock.to) {
                            hasMutualFree = true;
                            break;
                        }
                    }
                    if (hasMutualFree) break;
                }
                if (hasMutualFree) break;
            }
            
            day.classList.remove('you-free-highlight', 'you-busy-highlight', 'mutual-free-highlight', 'everyone-free-highlight', 'mixed-availability');
            day.style.background = '';
            
            if (c.everyoneFree[d]) {
                day.classList.add('everyone-free-highlight');
            } else if (hasFree && hasBusy) {
                day.classList.add('mixed-availability');
                let gradientParts = [];
                let sortedBlocks = [...freeBlocks, ...busyBlocks].sort((a, b) => a.from.localeCompare(b.from));
                
                for (let i = 0; i < sortedBlocks.length; i++) {
                    const block = sortedBlocks[i];
                    const fromHour = parseInt(block.from.split(':')[0]);
                    const toHour = parseInt(block.to.split(':')[0]);
                    const fromPercent = (fromHour / 24) * 100;
                    const toPercent = (toHour / 24) * 100;
                    
                    let color;
                    if (block.type === 'busy') {
                        color = '#ef4444';
                    } else {
                        let isMutual = false;
                        for (const friend of friends) {
                            const friendBlocks = (friend.blocks || []).filter(b => b.date === d && b.type === 'free');
                            for (const friendBlock of friendBlocks) {
                                if (block.from < friendBlock.to && friendBlock.from < block.to) {
                                    isMutual = true;
                                    break;
                                }
                            }
                            if (isMutual) break;
                        }
                        color = isMutual ? '#eab308' : '#3b82f6';
                    }
                    gradientParts.push(`${color} ${fromPercent}%, ${color} ${toPercent}%`);
                }
                
                day.style.background = `linear-gradient(to bottom, ${gradientParts.join(', ')})`;
                day.style.border = hasMutualFree ? '2px solid #eab308' : '2px solid #f59e0b';
                
                const freeHours = freeBlocks.map(b => `${b.from}–${b.to}`).join(', ');
                const busyHours = busyBlocks.map(b => `${b.from}–${b.to}`).join(', ');
                day.setAttribute('title', `🔵 Free: ${freeHours || 'None'}\n🔴 Busy: ${busyHours || 'None'}${hasMutualFree ? '\n🟡 Friend also free' : ''}`);
                
            } else if (hasMutualFree && !hasFullDayFree) {
                day.classList.add('mutual-free-highlight');
            } else if (hasFree || hasFullDayFree) {
                day.classList.add('you-free-highlight');
            } else if (hasBusy || hasFullDayBusy) {
                day.classList.add('you-busy-highlight');
            }
        });
    }, 100);
}

function initCalendar() {
    currentCalendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        scrollTime: '08:00:00',
        events: [],
        eventClick: (info) => {
            if (info.event.display === 'background') return;
            isEventClick = true;
            info.jsEvent.stopPropagation();
            const fullEvent = allEvents.find(e => e.id === info.event.id);
            if (fullEvent) {
                openEventModalFromData(fullEvent);
            } else {
                openEventModal(info.event);
            }
            return false;
        },
        dateClick: (info) => { if (!isEventClick) openDayModal(info.dateStr); isEventClick = false; },
        datesSet: () => applyDayHighlights(),
        dayCellDidMount: (info) => {
            const d = info.date.toISOString().split('T')[0];
            const c = calculateDayColors();
            if (c.everyoneFree[d]) info.el.classList.add('everyone-free-highlight');
            else if (c.mutualFree[d] && c.mutualFree[d].length > 0) info.el.classList.add('mutual-free-highlight');
            else if (c.youFree[d]) info.el.classList.add('you-free-highlight');
            else if (c.youBusy[d]) info.el.classList.add('you-busy-highlight');
            info.el.onclick = (e) => { if (e.target.closest('.fc-event')) return; if (!isEventClick) openDayModal(d); isEventClick = false; };
        }
    });
    currentCalendar.render();
    setTimeout(applyDayHighlights, 200);
}

function refreshCalendarData() {
    if (!currentCalendar) return;
    currentCalendar.removeAllEvents();
    
    const eventsToShow = getRelevantEvents().map(ev => {
        const isOwn = ev.createdBy === currentUser?.email;
        let title = `${ev.mood || '📌'} ${ev.title}`;
        if (isAdmin && adminViewEnabled && !isOwn) {
            title = `[${getDisplayName(ev.createdBy)}] ${title}`;
        }
        return {
            id: ev.id,
            title: title,
            start: `${ev.date}T${ev.time || '12:00'}`,
            extendedProps: { rsvps: ev.rsvps || {}, createdBy: ev.createdBy, isPublic: ev.isPublic }
        };
    });
    
    const bgEvents = buildScheduleBgEvents();
    eventsToShow.forEach(ev => currentCalendar.addEvent(ev));
    bgEvents.forEach(ev => currentCalendar.addEvent(ev));
    setTimeout(() => applyDayHighlights(), 100);
}

// ==================== DAY MODAL FUNCTIONS ====================

async function openDayModal(dateStr) {
    currentSelectedDay = dateStr;
    const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('dayModalTitle').innerText = label;
    document.getElementById('dayModalEventTime').value = "19:00";
    document.getElementById('dayModalEventTitle').value = "";
    document.getElementById('timePicker').classList.add('hidden');
    const timePickerArrow = document.getElementById('timePickerArrow');
    if (timePickerArrow) timePickerArrow.innerText = '▶';

    const colors = calculateDayColors();

    const mutualSection = document.getElementById('mutualFreeSection');
    const mutualList = document.getElementById('mutualFreeList');
    if (colors.mutualFree[dateStr]?.length > 0) {
        mutualList.innerHTML = colors.mutualFree[dateStr].map(email => `
            <div class="flex items-center gap-2 text-sm">
                ${avatarHtml(email, 'sm')}
                <span class="font-medium" style="color:var(--tp)">${getDisplayName(email)}</span>
                <span style="color:var(--ts)">is also free</span>
            </div>`).join('');
        mutualSection.classList.remove('hidden');
    } else mutualSection.classList.add('hidden');

    const missingSection = document.getElementById('missingAvailabilitySection');
    const missingList = document.getElementById('missingAvailabilityList');
    const rel = getRelevantSchedules();
    const missing = myFriends.filter(email => {
        const s = rel.find(s => s.email === email);
        return !s || !(s.blocks || []).some(b => b.date === dateStr);
    });
    if (missing.length > 0) {
        missingList.innerHTML = missing.map(email => `
            <div class="flex items-center gap-2 text-xs">
                ${avatarHtml(email, 'sm')}
                <span style="color:var(--ts)">${getDisplayName(email)}</span>
            </div>`).join('');
        missingSection.classList.remove('hidden');
    } else missingSection.classList.add('hidden');

    renderMyBlocksForDay(dateStr);
    updateAvailabilityStatusDisplay(dateStr);
    renderEventsOnDay(dateStr);
    document.getElementById('dayModal').classList.remove('hidden');
}

function getMyBlocksForDate(date) {
    const mine = allSchedules.find(s => s.email === currentUser?.email);
    return (mine?.blocks || []).filter(b => b.date === date);
}

function getMyStatusForDate(date) {
    const blocks = getMyBlocksForDate(date);
    if (blocks.some(b => b.type === 'busy')) return 'busy';
    if (blocks.some(b => b.type === 'free')) return 'free';
    return null;
}

function renderMyBlocksForDay(dateStr) {
    const blocks = getMyBlocksForDate(dateStr);
    const div = document.getElementById('myBlocksForDay');
    if (blocks.length === 0) {
        div.innerHTML = `<div class="text-xs italic" style="color:var(--ts)">No blocks set</div>`;
        return;
    }
    div.innerHTML = blocks.map((b, i) => `
        <div class="flex justify-between items-center text-xs px-2 py-1 rounded ${b.type === 'free' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">
            <span>${b.type === 'free' ? '🔵' : '🔴'} ${b.from} – ${b.to}</span>
            <button onclick="window.deleteMyBlock('${dateStr}',${i})" class="ml-2 font-bold hover:opacity-70">✕</button>
        </div>`).join('');
}

window.deleteMyBlock = async (dateStr, idx) => {
    const ref = doc(db, "schedules", currentUser.email);
    const snap = await getDoc(ref);
    let blocks = snap.data()?.blocks || [];
    let count = 0;
    const gi = blocks.findIndex(b => { if (b.date === dateStr) { if (count === idx) return true; count++; } return false; });
    if (gi !== -1) blocks.splice(gi, 1);
    await setDoc(ref, { email: currentUser.email, blocks });
    renderMyBlocksForDay(dateStr);
    updateAvailabilityStatusDisplay(dateStr);
    refreshCalendarData();
};

function updateAvailabilityStatusDisplay(dateStr) {
    const s = getMyStatusForDate(dateStr);
    const div = document.getElementById('currentAvailabilityStatus');
    if (s === 'busy') div.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">🔴 You're busy today</span>`;
    else if (s === 'free') div.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">🔵 You're free today</span>`;
    else div.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">⚪ No availability set</span>`;
}

function renderEventsOnDay(dateStr) {
    const eventsHere = getRelevantEvents().filter(ev => ev.date === dateStr);
    const div = document.getElementById('eventsOnDay');
    if (eventsHere.length === 0) {
        div.innerHTML = `<p class="text-sm text-center py-3" style="color:var(--ts)">No events yet — add one below!</p>`;
        return;
    }
    div.innerHTML = eventsHere.map(ev => `
        <div class="rounded-lg p-3 border" data-event-id="${ev.id}" style="background:rgba(0,0,0,0.03);border-color:var(--bc)">
            <div class="flex justify-between items-start gap-2">
                <div class="flex items-center gap-2 flex-1 flex-wrap">
                    <div class="flex items-center gap-2">
                        ${avatarHtml(ev.createdBy, 'sm')}
                        <span class="font-semibold text-sm" style="color:var(--tp)">${ev.mood || '📌'} ${ev.title}${ev.time ? `<span class="text-xs font-normal ml-1" style="color:var(--ts)">at ${ev.time}</span>` : ''}</span>
                    </div>
                    ${ev.isPublic ? '<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">🌍 Public</span>' : '<span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full ml-1">🔒 Private</span>'}
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs" style="color:var(--ts)">${getDisplayName(ev.createdBy)}</span>
                    ${(ev.createdBy === currentUser?.email || isAdmin) ? `
                        <button class="edit-event-btn ml-1 text-blue-500 hover:text-blue-700 font-bold" data-event-id="${ev.id}" title="Edit event">✏️</button>
                        <button class="delete-event-btn ml-1 text-red-500 hover:text-red-700 font-bold" data-event-id="${ev.id}" title="Delete event">🗑️</button>
                    ` : ''}
                </div>
            </div>
            <p class="text-xs mt-1" style="color:var(--ts)">${getRsvpSummary(ev.rsvps || {})}</p>
        </div>`).join('');

    document.querySelectorAll('.delete-event-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const eventId = btn.getAttribute('data-event-id');
            const event = eventsHere.find(e => e.id === eventId);
            if (event && confirm(`Delete "${event.title}"? ${isAdmin && event.createdBy !== currentUser?.email ? '(Admin action)' : ''}`)) {
                await deleteEvent(eventId);
            }
        });
    });

    document.querySelectorAll('.edit-event-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const eventId = btn.getAttribute('data-event-id');
            const event = eventsHere.find(e => e.id === eventId);
            if (event) {
                document.getElementById('dayModal').classList.add('hidden');
                await openEventModalFromData(event);
                setTimeout(() => {
                    const toggleBtn = document.getElementById('toggleEditBtn');
                    if (toggleBtn && !toggleBtn.classList.contains('hidden')) {
                        toggleBtn.click();
                    }
                }, 100);
            }
        });
    });

    div.querySelectorAll('[data-event-id]').forEach(el => {
        if (!el.classList.contains('delete-event-btn') && !el.classList.contains('edit-event-btn')) {
            el.addEventListener('click', e => {
                if (e.target.classList.contains('delete-event-btn') || e.target.classList.contains('edit-event-btn')) return;
                e.stopPropagation();
                const ev = eventsHere.find(e => e.id === el.getAttribute('data-event-id'));
                if (ev) {
                    document.getElementById('dayModal').classList.add('hidden');
                    openEventModalFromData(ev);
                }
            });
        }
    });
}

function getRsvpSummary(rsvps) {
    const n = Object.values(rsvps).filter(v => v === 'going').length;
    return n === 0 ? 'No RSVPs yet' : `✅ ${n} going`;
}

// ==================== AVAILABILITY BUTTONS ====================

async function saveBlock(dateStr, from, to, type) {
    const ref = doc(db, "schedules", currentUser.email);
    const snap = await getDoc(ref);
    const blocks = snap.exists() ? (snap.data().blocks || []) : [];
    blocks.push({ date: dateStr, from, to, type });
    await setDoc(ref, { email: currentUser.email, blocks });
    renderMyBlocksForDay(dateStr);
    updateAvailabilityStatusDisplay(dateStr);
    refreshCalendarData();
}

// ==================== EVENT MODAL FUNCTIONS ====================

function buildRsvpHtml(rsvps, createdBy, isPublic = false) {
    const going = Object.entries(rsvps).filter(([, v]) => v === 'going');
    const maybe = Object.entries(rsvps).filter(([, v]) => v === 'maybe');
    
    const isPublicViewer = isPublic && createdBy !== currentUser?.email && !myFriends.includes(createdBy);
    
    if (isPublicViewer) {
        return `<div class="flex items-center gap-2 mb-3">
                    ${avatarHtml(createdBy, 'sm')}
                    <span style="color:var(--ts)">Created by <strong style="color:var(--tp)">${getDisplayName(createdBy)}</strong></span>
                </div>
                <div class="space-y-2 text-sm">
                    <div>✅ Going: ${going.length} people</div>
                    <div>🤔 Maybe: ${maybe.length} people</div>
                </div>`;
    }
    
    const goingNames = going.map(([email]) => getDisplayName(email)).join(', ') || 'None';
    const maybeNames = maybe.map(([email]) => getDisplayName(email)).join(', ') || 'None';
    
    return `<div class="flex items-center gap-2 mb-3">
                ${avatarHtml(createdBy, 'sm')}
                <span style="color:var(--ts)">Created by <strong style="color:var(--tp)">${getDisplayName(createdBy)}</strong></span>
            </div>
            <div class="space-y-2 text-sm">
                <div>✅ Going: ${goingNames}</div>
                <div>🤔 Maybe: ${maybeNames}</div>
            </div>`;
}

function openEventModal(fcEvent) {
    currentEventId = fcEvent.id;
    const fullEvent = allEvents.find(e => e.id === fcEvent.id);
    if (fullEvent) {
        openEventModalFromData(fullEvent);
    } else {
        document.getElementById('modalTitle').innerText = fcEvent.title;
        document.getElementById('modalDetails').innerHTML = buildRsvpHtml(fcEvent.extendedProps.rsvps, fcEvent.extendedProps.createdBy, fcEvent.extendedProps.isPublic);
        document.getElementById('toggleEditBtn')?.classList.add('hidden');
        document.getElementById('eventModal').classList.remove('hidden');
    }
}

function openEventModalFromData(ev) {
    currentEventId = ev.id;
    currentEditingEvent = ev;
    const isCreator = ev.createdBy === currentUser?.email;
    const canEdit = isCreator || isAdmin;
    
    document.getElementById('modalTitle').innerHTML = `${ev.mood || '📌'} ${ev.title}`;
    document.getElementById('modalDetails').innerHTML = buildRsvpHtml(ev.rsvps || {}, ev.createdBy, ev.isPublic);
    
    const toggleEditBtn = document.getElementById('toggleEditBtn');
    const editSection = document.getElementById('editEventSection');
    
    if (canEdit && toggleEditBtn && editSection) {
        toggleEditBtn.classList.remove('hidden');
        document.getElementById('editEventTitle').value = ev.title;
        document.getElementById('editEventTime').value = ev.time || '12:00';
        document.getElementById('editEventMood').value = ev.mood || '🎉';
        const isPublic = ev.isPublic === true;
        document.getElementById('editEventVisibility').checked = isPublic;
        updateEditVisibilityLabel(isPublic);
        editSection.classList.add('hidden');
        toggleEditBtn.innerHTML = '✏️ Edit Event';
    } else if (toggleEditBtn) {
        toggleEditBtn.classList.add('hidden');
        if (editSection) editSection.classList.add('hidden');
    }
    
    document.getElementById('eventModal').classList.remove('hidden');
}

function updateEditVisibilityLabel(isPublic) {
    const label = document.getElementById('editVisibilityLabel');
    if (!label) return;
    if (isPublic) {
        label.textContent = '🌍 Public';
        label.style.background = '#22c55e20';
        label.style.color = '#22c55e';
    } else {
        label.textContent = '🔒 Private';
        label.style.background = 'var(--bc)';
        label.style.color = 'var(--ts)';
    }
}

document.getElementById('toggleEditBtn')?.addEventListener('click', () => {
    const editSection = document.getElementById('editEventSection');
    const isHidden = editSection.classList.contains('hidden');
    editSection.classList.toggle('hidden', !isHidden);
    const toggleBtn = document.getElementById('toggleEditBtn');
    if (toggleBtn) {
        toggleBtn.innerHTML = isHidden ? '❌ Cancel Edit' : '✏️ Edit Event';
    }
});

document.getElementById('cancelEventEditBtn')?.addEventListener('click', () => {
    const editSection = document.getElementById('editEventSection');
    const toggleBtn = document.getElementById('toggleEditBtn');
    if (editSection) editSection.classList.add('hidden');
    if (toggleBtn) toggleBtn.innerHTML = '✏️ Edit Event';
});

document.getElementById('saveEventEditBtn')?.addEventListener('click', async () => {
    if (!currentEventId || !currentEditingEvent) return;
    
    const newTitle = document.getElementById('editEventTitle')?.value.trim();
    if (!newTitle) {
        alert("Event title cannot be empty");
        return;
    }
    
    const newTime = document.getElementById('editEventTime')?.value || '12:00';
    const newMood = document.getElementById('editEventMood')?.value || '🎉';
    const newVisibility = document.getElementById('editEventVisibility')?.checked || false;
    
    try {
        const eventRef = doc(db, "events", currentEventId);
        await updateDoc(eventRef, {
            title: newTitle,
            time: newTime,
            mood: newMood,
            isPublic: newVisibility,
            updatedAt: new Date().toISOString()
        });
        
        const editSection = document.getElementById('editEventSection');
        const toggleBtn = document.getElementById('toggleEditBtn');
        if (editSection) editSection.classList.add('hidden');
        if (toggleBtn) toggleBtn.innerHTML = '✏️ Edit Event';
        document.getElementById('eventModal').classList.add('hidden');
        
        if (currentSelectedDay) {
            renderEventsOnDay(currentSelectedDay);
        }
        refreshCalendarData();
        
    } catch (error) {
        console.error("Error updating event:", error);
        alert("Failed to update event: " + error.message);
    }
});

document.getElementById('editEventVisibility')?.addEventListener('change', (e) => {
    updateEditVisibilityLabel(e.target.checked);
});

async function deleteEvent(eventId) {
    try {
        const eventRef = doc(db, "events", eventId);
        const eventSnap = await getDoc(eventRef);
        
        if (!eventSnap.exists()) {
            alert("Event not found");
            return;
        }
        
        const eventData = eventSnap.data();
        
        if (eventData.createdBy !== currentUser?.email && !isAdmin) {
            alert("You can only delete events you created");
            return;
        }
        
        if (confirm(`Are you sure you want to delete "${eventData.title}"? ${isAdmin && eventData.createdBy !== currentUser?.email ? '(Admin action)' : ''}`)) {
            await deleteDoc(eventRef);
            
            if (currentSelectedDay) {
                renderEventsOnDay(currentSelectedDay);
            }
            refreshCalendarData();
        }
        
    } catch (error) {
        console.error("Error deleting event:", error);
        alert("Failed to delete event: " + error.message);
    }
}

async function submitRsvp(status) {
    if (!currentEventId) return;
    const ref = doc(db, "events", currentEventId);
    const snap = await getDoc(ref);
    const rsvps = snap.data()?.rsvps || {};
    rsvps[currentUser.email] = status;
    await updateDoc(ref, { rsvps });
    document.getElementById('eventModal').classList.add('hidden');

    const evData = snap.data();
    if (evData.createdBy && evData.createdBy !== currentUser.email) {
        const myName = getDisplayName(currentUser.email);
        const statusLabel = status === 'going' ? '✅ going' : status === 'maybe' ? '🤔 maybe' : '❌ can\'t make it';
        await createNotification(evData.createdBy, '📢 RSVP Update', `${myName} is ${statusLabel} to "${evData.title}"!`, 'rsvp');
    }
}

// ==================== STATS FUNCTIONS ====================

function updateStatsBar() {
    const c = calculateDayColors();
    document.getElementById('freeDaysCount').innerText = Object.keys(c.everyoneFree).length;
    document.getElementById('memberCount').innerText = isAdmin && adminViewEnabled ? `${allSchedules.length} total` : myFriends.length;
    document.getElementById('statsBar').classList.remove('hidden');
    document.getElementById('adminStats').classList.toggle('hidden', !(isAdmin && adminViewEnabled));
}

// ==================== ADMIN FUNCTIONS ====================

async function loadAllUsers() {
    const snap = await getDocs(collection(db, "schedules"));
    const users = [];
    snap.forEach(d => users.push({ email: d.id }));
    return users;
}

async function deleteUser(email) {
    if (!confirm(`Delete ${email} and all their data?`)) return;
    await deleteDoc(doc(db, "schedules", email));
    const u = await getDoc(doc(db, "users", email));
    if (u.exists()) await deleteDoc(doc(db, "users", email));
    alert(`Deleted ${email}`);
    if (currentUser?.email === email) await signOut(auth);
}

async function exportAllData() {
    const data = { users: allSchedules.map(s => ({ email: s.email, blocks: s.blocks })), events: allEvents, friendRelationships: [] };
    const snap = await getDocs(collection(db, "users"));
    snap.forEach(d => data.friendRelationships.push({ user: d.id, friends: d.data().friends || [] }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

window.deleteUser = deleteUser;

// ==================== PROFILE FUNCTIONS ====================

function openProfileModal() {
    const profile = allUserProfiles[currentUser.email];
    document.getElementById('profileDisplayName').value = profile?.displayName || currentUser.email.split('@')[0];
    document.getElementById('profileEmail').value = currentUser.email;
    
    const avatarImg = document.getElementById('profileAvatar');
    if (profile?.photoURL) {
        avatarImg.src = profile.photoURL;
        avatarImg.classList.remove('hidden');
    } else {
        avatarImg.src = '';
        avatarImg.classList.add('hidden');
    }
    
    document.getElementById('profileModal').classList.remove('hidden');
}

async function saveProfileChanges() {
    const newDisplayName = document.getElementById('profileDisplayName').value.trim();
    if (!newDisplayName) {
        alert("Display name cannot be empty");
        return;
    }
    
    try {
        await updateDisplayName(currentUser.email, newDisplayName);
        document.getElementById('userDisplayName').innerText = newDisplayName;
        
        const avatarFallback = document.getElementById('avatarFallback');
        if (avatarFallback && !currentUser.photoURL) {
            avatarFallback.innerText = newDisplayName.charAt(0).toUpperCase();
        }
        
        document.getElementById('profileModal').classList.add('hidden');
        refreshCalendarData();
        
        if (currentSelectedDay) {
            renderEventsOnDay(currentSelectedDay);
        }
        
        alert("Profile updated successfully!");
    } catch (error) {
        console.error("Error saving profile:", error);
        alert("Failed to save profile: " + error.message);
    }
}

// ==================== PROFILE PHOTO FUNCTIONS ====================

async function uploadProfilePhoto(file) {
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert("Please select an image file");
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        alert("Image must be less than 5MB");
        return;
    }
    
    try {
        const avatarImg = document.getElementById('profileAvatar');
        avatarImg.style.opacity = '0.5';
        
        const reader = new FileReader();
        reader.onloadend = async function() {
            const base64String = reader.result;
            
            const profileRef = doc(db, "userProfiles", currentUser.email);
            await updateDoc(profileRef, { photoURL: base64String });
            
            allUserProfiles[currentUser.email].photoURL = base64String;
            
            avatarImg.src = base64String;
            avatarImg.classList.remove('hidden');
            avatarImg.style.opacity = '1';
            
            const myAvatar = document.getElementById('myAvatar');
            const avatarFallback = document.getElementById('avatarFallback');
            myAvatar.src = base64String;
            myAvatar.classList.remove('hidden');
            avatarFallback.classList.add('hidden');
            
            currentUser.photoURL = base64String;
            
            alert("Profile photo updated successfully!");
            
            refreshCalendarData();
            if (currentSelectedDay) {
                renderEventsOnDay(currentSelectedDay);
            }
        };
        reader.readAsDataURL(file);
        
    } catch (error) {
        console.error("Error uploading photo:", error);
        alert("Failed to upload photo: " + error.message);
        const avatarImg = document.getElementById('profileAvatar');
        avatarImg.style.opacity = '1';
    }
}

// ==================== MODAL TABS ====================

function switchTab(name) {
    const tabs = ['friends', 'requests', 'search'];
    tabs.forEach(t => {
        const tabEl = document.getElementById(`${t}Tab`);
        const btnEl = document.getElementById(`${t}TabBtn`);
        if (tabEl) tabEl.classList.toggle('hidden', t !== name);
        if (btnEl) btnEl.classList.toggle('tab-active', t === name);
    });
}

// ==================== EVENT LISTENERS SETUP ====================

function setupEventListeners() {
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.onclick = () => openProfileModal();
    }
    
    document.getElementById('closeProfileModal')?.addEventListener('click', () => {
        document.getElementById('profileModal').classList.add('hidden');
    });
    
    document.getElementById('closeProfileModalBtn')?.addEventListener('click', () => {
        document.getElementById('profileModal').classList.add('hidden');
    });
    
    document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfileChanges);
    
    const profileAvatarContainer = document.getElementById('profileAvatarContainer');
    const profilePhotoUpload = document.getElementById('profilePhotoUpload');
    
    if (profileAvatarContainer) {
        profileAvatarContainer.addEventListener('click', () => {
            profilePhotoUpload.click();
        });
    }
    
    if (profilePhotoUpload) {
        profilePhotoUpload.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadProfilePhoto(e.target.files[0]);
            }
        });
    }
    
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.onclick = () => {
            const cur = document.body.getAttribute('data-theme');
            document.querySelectorAll('.theme-option-card').forEach(c => {
                c.style.border = c.getAttribute('data-theme') === cur ? '2px solid white' : 'none';
            });
            document.getElementById('themeModal').classList.remove('hidden');
        };
    }
    
    document.getElementById('closeThemeModal').onclick = () => document.getElementById('themeModal').classList.add('hidden');
    document.querySelectorAll('.theme-option-card').forEach(c => {
        c.addEventListener('click', () => { setTheme(c.getAttribute('data-theme')); document.getElementById('themeModal').classList.add('hidden'); });
    });
    
    document.getElementById('notificationBell').onclick = async (e) => {
        e.stopPropagation();
        const panel = document.getElementById('notificationPanel');
        const isVisible = panel.style.display === 'block';
        if (!isVisible) await markAllNotifsAsRead();
        panel.style.display = isVisible ? 'none' : 'block';
    };
    document.getElementById('clearNotificationsBtn').onclick = async () => {
        await clearAllNotifs();
        document.getElementById('notificationPanel').style.display = 'none';
    };
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('notificationPanel');
        const bell = document.getElementById('notificationBell');
        if (panel && !panel.contains(e.target) && !bell.contains(e.target)) panel.style.display = 'none';
    });
    
    const setFreeBtn = document.getElementById('setFreeBtn');
    if (setFreeBtn) setFreeBtn.onclick = async () => { if (currentSelectedDay) await saveBlock(currentSelectedDay, "00:00", "23:59", "free"); };
    
    const setBusyBtn = document.getElementById('setBusyBtn');
    if (setBusyBtn) setBusyBtn.onclick = async () => { if (currentSelectedDay) await saveBlock(currentSelectedDay, "00:00", "23:59", "busy"); };
    
    const clearAvailabilityBtn = document.getElementById('clearAvailabilityBtn');
    if (clearAvailabilityBtn) {
        clearAvailabilityBtn.onclick = async () => {
            if (!currentSelectedDay || !confirm("Clear all availability for this day?")) return;
            const ref = doc(db, "schedules", currentUser.email);
            const snap = await getDoc(ref);
            const blocks = (snap.data()?.blocks || []).filter(b => b.date !== currentSelectedDay);
            await setDoc(ref, { email: currentUser.email, blocks });
            renderMyBlocksForDay(currentSelectedDay);
            updateAvailabilityStatusDisplay(currentSelectedDay);
            refreshCalendarData();
        };
    }
    
    const toggleTimePicker = document.getElementById('toggleTimePicker');
    if (toggleTimePicker) {
        toggleTimePicker.onclick = () => {
            const tp = document.getElementById('timePicker');
            const arrow = document.getElementById('timePickerArrow');
            if (arrow) arrow.innerText = tp.classList.toggle('hidden') ? '▶' : '▼';
        };
    }
    
    const addBlockBtn = document.getElementById('addBlockBtn');
    if (addBlockBtn) {
        addBlockBtn.onclick = async () => {
            const from = document.getElementById('blockFrom').value;
            const to = document.getElementById('blockTo').value;
            const type = document.getElementById('blockType').value;
            if (!from || !to) { alert("Set both times"); return; }
            if (from >= to) { alert("End must be after start"); return; }
            await saveBlock(currentSelectedDay, from, to, type);
            document.getElementById('timePicker').classList.add('hidden');
            const arrow = document.getElementById('timePickerArrow');
            if (arrow) arrow.innerText = '▶';
        };
    }
    
    document.getElementById('closeDayModal').onclick = () => document.getElementById('dayModal').classList.add('hidden');
    document.getElementById('closeModal').onclick = () => document.getElementById('eventModal').classList.add('hidden');
    
    const addEventBtn = document.getElementById('addEventFromDayBtn');
    if (addEventBtn) {
        addEventBtn.onclick = async () => {
            const title = document.getElementById('dayModalEventTitle').value.trim();
            if (!title) { alert("Please enter a title"); return; }
            const isPublic = document.getElementById('eventVisibility')?.checked || false;
            await addDoc(collection(db, "events"), {
                title, date: currentSelectedDay,
                time: document.getElementById('dayModalEventTime').value,
                mood: document.getElementById('dayModalEventMood').value,
                createdBy: currentUser.email,
                createdAt: new Date().toISOString(),
                rsvps: {},
                isPublic: isPublic
            });
            document.getElementById('dayModalEventTitle').value = "";
            if (document.getElementById('eventVisibility')) {
                document.getElementById('eventVisibility').checked = false;
            }
            document.getElementById('dayModal').classList.add('hidden');
            
            if (!isPublic) {
                const dateLabel = new Date(currentSelectedDay + 'T12:00:00').toLocaleDateString('en-IE', { weekday: 'short', month: 'short', day: 'numeric' });
                const myName = getDisplayName(currentUser.email);
                for (const friendEmail of myFriends) {
                    await createNotification(friendEmail, `📅 New Event`, `${myName} added "${title}" on ${dateLabel}`, 'new_event');
                }
            }
            alert(isPublic ? "Public event added! Everyone can see it." : "Event added! 🎉");
            refreshCalendarData();
        };
    }
    
    document.getElementById('rsvpYes').onclick = () => submitRsvp('going');
    document.getElementById('rsvpMaybe').onclick = () => submitRsvp('maybe');
    document.getElementById('rsvpNo').onclick = () => submitRsvp('no');
    
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
        adminBtn.onclick = async () => {
            const users = await loadAllUsers();
            const c = document.getElementById('allUsersList');
            c.innerHTML = users.length === 0 ? `<div class="text-center text-sm p-4" style="color:var(--ts)">No users</div>` :
                users.map(u => `<div class="flex justify-between items-center p-2 rounded-lg" style="background:rgba(0,0,0,0.03)">
                    <div class="flex items-center gap-2">${avatarHtml(u.email, 'sm')}<span class="text-sm" style="color:var(--tp)">${getDisplayName(u.email)}</span></div>
                    <button onclick="window.deleteUser('${u.email}')" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs">Delete</button>
                </div>`).join('');
            document.getElementById('adminModal').classList.remove('hidden');
        };
    }
    
    document.getElementById('closeAdminModal').onclick = () => document.getElementById('adminModal').classList.add('hidden');
    document.getElementById('closeAdminModalBtn').onclick = () => document.getElementById('adminModal').classList.add('hidden');
    document.getElementById('exportAllDataBtn').onclick = exportAllData;
    
    const adminToggle = document.getElementById('adminViewToggle');
    if (adminToggle) {
        adminToggle.addEventListener('change', e => {
            adminViewEnabled = e.target.checked;
            document.getElementById('adminStatusBadge').classList.toggle('hidden', !adminViewEnabled);
            document.getElementById('adminStats').classList.toggle('hidden', !adminViewEnabled);
            refreshCalendarData();
            updateStatsBar();
        });
    }
    
    const friendsBtn = document.getElementById('friendsBtn');
    if (friendsBtn) {
        friendsBtn.onclick = () => { updateFriendsUI(); updateRequestsUI(); document.getElementById('friendsModal').classList.remove('hidden'); };
    }
    document.getElementById('closeFriendsModal').onclick = () => document.getElementById('friendsModal').classList.add('hidden');
    document.getElementById('friendsTabBtn').onclick = () => switchTab('friends');
    document.getElementById('requestsTabBtn').onclick = () => { switchTab('requests'); updateRequestsUI(); };
    document.getElementById('searchTabBtn').onclick = () => switchTab('search');
    
    const searchBtn = document.getElementById('searchUserBtn');
    if (searchBtn) {
        searchBtn.onclick = () => {
            const searchValue = document.getElementById('searchEmailInput').value.trim();
            if (searchValue) {
                searchUser(searchValue);
            } else {
                alert("Enter a name or email address to search");
            }
        };
    }
    
    // Push notification buttons
    const enablePushFromBanner = document.getElementById('enablePushFromBanner');
    const dismissPushBanner = document.getElementById('dismissPushBanner');
    const closePushBanner = document.getElementById('closePushBanner');
    const enablePushBtn = document.getElementById('enablePushBtn');
    const disablePushBtn = document.getElementById('disablePushBtn');
    
    if (enablePushFromBanner) {
        enablePushFromBanner.addEventListener('click', enablePushNotifications);
    }
    if (dismissPushBanner) {
        dismissPushBanner.addEventListener('click', permanentlyDismissPushBanner);
    }
    if (closePushBanner) {
        closePushBanner.addEventListener('click', permanentlyDismissPushBanner);
    }
    if (enablePushBtn) {
        enablePushBtn.addEventListener('click', enablePushNotifications);
    }
    if (disablePushBtn) {
        disablePushBtn.addEventListener('click', async () => {
            if (confirm("Disable notifications?")) {
                const userRef = doc(db, "users", currentUser.email);
                await updateDoc(userRef, { pushEnabled: false });
                updatePushStatusUI(false);
                showToastMessage("Notifications disabled", "info");
            }
        });
    }
    
    document.getElementById('googleLoginBtn').onclick = async () => {
        try {
            await signInWithPopup(auth, provider);
            if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
        } catch (e) { alert("Login failed: " + e.message); }
    };
    document.getElementById('logoutBtn').onclick = () => signOut(auth);
}

// ==================== INITIALIZE THEME ====================

const savedTheme = localStorage.getItem('selectedTheme');
document.body.setAttribute('data-theme', savedTheme || 'ocean');

// ==================== AUTH STATE LISTENER ====================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
        
        const myAvatar = document.getElementById('myAvatar');
        const avatarFallback = document.getElementById('avatarFallback');
        const userDisplayNameSpan = document.getElementById('userDisplayName');
        
        await loadAllUserProfiles();
        
        const displayName = allUserProfiles[user.email]?.displayName || user.displayName || user.email.split('@')[0];
        userDisplayNameSpan.innerText = displayName;
        
        if (allUserProfiles[user.email]?.photoURL || user.photoURL) {
            const photoURL = allUserProfiles[user.email]?.photoURL || user.photoURL;
            myAvatar.src = photoURL;
            myAvatar.classList.remove('hidden');
            avatarFallback.classList.add('hidden');
        } else {
            myAvatar.classList.add('hidden');
            avatarFallback.innerText = displayName.charAt(0).toUpperCase();
            avatarFallback.classList.remove('hidden');
            avatarFallback.style.display = 'flex';
        }
        
        // ADMIN CHECK - ONLY show admin elements for specific admin emails
        const adminEmails = ['luara0511f@gmail.com'];
        isAdmin = adminEmails.includes(user.email);
        
        const adminBtn = document.getElementById('adminBtn');
        const adminToggleContainer = document.getElementById('adminToggleContainer');
        
        if (isAdmin) {
            // Show admin elements for admin users
            if (adminBtn) adminBtn.classList.remove('hidden');
            if (adminToggleContainer) adminToggleContainer.classList.remove('hidden');
        } else {
            // Hide admin elements for regular users
            if (adminBtn) adminBtn.classList.add('hidden');
            if (adminToggleContainer) adminToggleContainer.classList.add('hidden');
            // Also make sure adminViewEnabled is false
            adminViewEnabled = false;
            const adminToggleCheckbox = document.getElementById('adminViewToggle');
            if (adminToggleCheckbox) adminToggleCheckbox.checked = false;
        }
        
        await setDoc(doc(db, "userProfiles", user.email), {
            displayName: displayName,
            photoURL: allUserProfiles[user.email]?.photoURL || user.photoURL || '',
            email: user.email
        }, { merge: true });
        
        const profileSnap = await getDocs(collection(db, "userProfiles"));
        allUserProfiles = {};
        profileSnap.forEach(doc => {
            allUserProfiles[doc.id] = doc.data();
        });
        
        const userScheduleRef = doc(db, "schedules", user.email);
        const userScheduleSnap = await getDoc(userScheduleRef);
        if (!userScheduleSnap.exists()) {
            await setDoc(userScheduleRef, { email: user.email, blocks: [] });
        }
        
        const userRef = doc(db, "users", user.email);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            myFriends = userSnap.data().friends || [];
            pendingRequests = userSnap.data().pendingRequests || [];
            sentRequests = userSnap.data().sentRequests || [];
        } else {
            myFriends = [];
            pendingRequests = [];
            sentRequests = [];
            await setDoc(userRef, { email: user.email, friends: [], pendingRequests: [], sentRequests: [] });
        }
        updateFriendsUI();
        updateRequestBadge();
        
        const schedulesQuery = collection(db, "schedules");
        const schedulesUnsub = onSnapshot(schedulesQuery, (snapshot) => {
            allSchedules = [];
            snapshot.forEach(doc => {
                allSchedules.push(doc.data());
            });
            if (!currentCalendar) {
                initCalendar();
            } else {
                refreshCalendarData();
            }
            updateStatsBar();
        });
        
        const eventsQuery = collection(db, "events");
        const eventsUnsub = onSnapshot(eventsQuery, (snapshot) => {
            allEvents = [];
            snapshot.forEach(doc => {
                allEvents.push({ id: doc.id, ...doc.data() });
            });
            if (currentCalendar) {
                refreshCalendarData();
            }
        });
        
        const userListenerUnsub = onSnapshot(doc(db, "users", user.email), (snap) => {
            if (snap.exists()) {
                myFriends = snap.data().friends || [];
                pendingRequests = snap.data().pendingRequests || [];
                sentRequests = snap.data().sentRequests || [];
                updateFriendsUI();
                updateRequestBadge();
                if (currentCalendar) {
                    refreshCalendarData();
                }
                updateStatsBar();
            }
        });
        
        subscribeToMyNotifications();
        
        window.cleanupListeners = () => {
            schedulesUnsub();
            eventsUnsub();
            userListenerUnsub();
            if (notifUnsubscribe) notifUnsubscribe();
        };
        
        updateStatsBar();
        setupEventListeners();
        
        const userDoc = await getDoc(doc(db, "users", user.email));
        const pushEnabled = userDoc.data()?.pushEnabled;
        
        if (pushEnabled) {
            updatePushStatusUI(true);
        } else {
            updatePushStatusUI(false);
            const bannerDismissed = localStorage.getItem('pushBannerDismissed');
            if (!bannerDismissed) {
                setTimeout(() => {
                    showPushBanner();
                }, 2000);
            }
        }
        
    } else {
        if (window.cleanupListeners) {
            window.cleanupListeners();
        }
        currentUser = null;
        isAdmin = false;
        adminViewEnabled = false;
        allSchedules = [];
        allEvents = [];
        myFriends = [];
        
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainScreen').classList.add('hidden');
        
        if (currentCalendar) {
            currentCalendar.destroy();
            currentCalendar = null;
        }
    }
});