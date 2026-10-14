/**
 * Urban Flood Prediction and Early Warning System
 * Client-Side JavaScript: Geolocation, Counting Animations, Sidebar & Modal Controls
 */

document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------
    // 1. Smooth Number Counter Animation for Statistics Cards
    // -------------------------------------------------------------
    const counters = document.querySelectorAll(".stat-number[data-target]");
    counters.forEach(counter => {
        const target = parseFloat(counter.getAttribute("data-target")) || 0;
        const isDecimal = target % 1 !== 0;
        const duration = 1200; // ms
        const startTime = performance.now();

        function updateCounter(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic curve
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const currentVal = easeOut * target;

            if (isDecimal) {
                counter.innerText = currentVal.toFixed(1);
            } else {
                counter.innerText = Math.floor(currentVal).toLocaleString();
            }

            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            } else {
                counter.innerText = isDecimal ? target.toFixed(1) : target.toLocaleString();
            }
        }

        requestAnimationFrame(updateCounter);
    });

    // -------------------------------------------------------------
    // 2. Mobile Responsive Sidebar Toggle
    // -------------------------------------------------------------
    const sidebar = document.getElementById("appSidebar");
    const toggleBtn = document.getElementById("sidebarToggle");

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            sidebar.classList.toggle("open");
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener("click", (e) => {
            if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== toggleBtn) {
                sidebar.classList.remove("open");
            }
        });
    }

    // -------------------------------------------------------------
    // 3. Modal Dialog Controls (Backdrop blur overlay)
    // -------------------------------------------------------------
    window.openModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add("active");
            document.body.style.overflow = "hidden";
        }
    };

    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove("active");
            document.body.style.overflow = "";
        }
    };

    // Close modal on backdrop click
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.remove("active");
                document.body.style.overflow = "";
            }
        });
    });

    // -------------------------------------------------------------
    // 4. Auto GPS Geolocation Handler
    // -------------------------------------------------------------
    const autoLocateBtn = document.getElementById("btn-autolocate");
    const autoStatus = document.getElementById("auto-status");

    if (autoLocateBtn) {
        autoLocateBtn.addEventListener("click", () => {
            if (!navigator.geolocation) {
                showStatus("Geolocation is not supported by your current browser.", "danger");
                return;
            }

            autoLocateBtn.disabled = true;
            autoLocateBtn.innerHTML = `
                <span class="spinner" style="display:inline-block; animation: spin 1s infinite linear;">⏳</span> 
                Detecting GPS Coordinates...
            `;
            showStatus("Requesting satellite/browser location coordinates...", "info");

            function attemptGeolocation(highAccuracy) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        showStatus(`Coordinates locked (${lat.toFixed(4)}, ${lon.toFixed(4)}). Ingesting weather data & classifying risk...`, "info");

                        // Attempt client-side reverse geocoding via OpenStreetMap Nominatim
                        let detectedPlaceName = null;
                        try {
                            const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=11`, {
                                headers: { "Accept": "application/json" }
                            });
                            if (revRes.ok) {
                                const revData = await revRes.json();
                                const addr = revData.address || {};
                                detectedPlaceName = addr.city || addr.town || addr.county || addr.state_district || addr.suburb || addr.village;
                            }
                        } catch (e) {
                            // Client reverse lookup failed or offline; server fallback handles it
                        }

                        try {
                            const response = await fetch("/predict/auto", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Accept": "application/json"
                                },
                                body: JSON.stringify({ 
                                    latitude: lat, 
                                    longitude: lon,
                                    place_name: detectedPlaceName
                                })
                            });

                            const result = await response.json();
                            if (result.success && result.redirect_url) {
                                showStatus(`Monitored zone identified: ${result.location_name || 'Designated Region'}. Loading OpenStreetMap risk assessment...`, "success");
                                window.location.href = result.redirect_url;
                            } else if (result.not_applicable && result.redirect_url) {
                                showStatus(`${result.location_name || 'Detected Location'} — Outside Surveillance Bounds. Redirecting...`, "warning");
                                window.location.href = result.redirect_url;
                            } else {
                                showStatus(result.error || "Prediction request failed on server.", "danger");
                                resetAutoBtn();
                            }
                        } catch (err) {
                            console.error("Inference request error:", err);
                            showStatus("Network or server error during flood evaluation. Please try again.", "danger");
                            resetAutoBtn();
                        }
                    },
                    (error) => {
                        // If high-accuracy timed out, retry once with standard network positioning
                        if (highAccuracy && error.code === error.TIMEOUT) {
                            showStatus("Satellite lock timed out. Retrying with network/Wi-Fi positioning...", "info");
                            attemptGeolocation(false);
                            return;
                        }

                        let msg = "Could not obtain location.";
                        switch (error.code) {
                            case error.PERMISSION_DENIED:
                                msg = "Location permission denied. Please allow location access in your browser or select your zone manually.";
                                break;
                            case error.POSITION_UNAVAILABLE:
                                msg = "Location information is unavailable on this device. Please select your Karnataka zone manually.";
                                break;
                            case error.TIMEOUT:
                                msg = "Location request timed out. Please retry or select your Karnataka zone manually.";
                                break;
                        }
                        showStatus(msg, "danger");
                        resetAutoBtn();
                    },
                    { 
                        enableHighAccuracy: highAccuracy, 
                        timeout: highAccuracy ? 8000 : 15000, 
                        maximumAge: highAccuracy ? 0 : 60000 
                    }
                );
            }

            attemptGeolocation(true);
        });
    }

    function showStatus(text, type) {
        if (!autoStatus) return;
        autoStatus.style.display = "block";
        autoStatus.className = `alert alert-${type}`;
        autoStatus.innerText = text;
    }

    function resetAutoBtn() {
        if (!autoLocateBtn) return;
        autoLocateBtn.disabled = false;
        autoLocateBtn.innerHTML = `📡 Auto-Fetch My GPS Location`;
    }

    // -------------------------------------------------------------
    // 5. Quick City Search Shortcuts on Custom Location Page
    // -------------------------------------------------------------
    const cityChips = document.querySelectorAll(".city-chip");
    const cityInput = document.getElementById("city_name_input");
    if (cityChips && cityInput) {
        cityChips.forEach(chip => {
            chip.addEventListener("click", () => {
                cityInput.value = chip.dataset.city || chip.innerText.trim();
                cityInput.focus();
            });
        });
    }
});
