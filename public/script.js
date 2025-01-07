let map; // Global map variable
const itinerary = [];
const daysContainer = document.getElementById("daysContainer");
const daySelector = document.getElementById("daySelector");
const travelMode = document.getElementById("travelMode").value; // Get selected travel mode


const dayColors = [
    "#FF5733", // Day 1: Red-orange
    "#33FF57", // Day 2: Green
    "#3357FF", // Day 3: Blue
    "#FF33A1", // Day 4: Pink
    "#FFFF33", // Day 5: Yellow
    "#33FFFF", // Day 6: Cyan
    "#A633FF", // Day 7: Purple
    // Add more colors as needed
];

// Initialize map
async function initMap() {
    try {
        const response = await fetch('/config');
        if (!response.ok) {
            throw new Error('Failed to fetch Mapbox configuration.');
        }

        const { mapboxToken } = await response.json();

        mapboxgl.accessToken = mapboxToken; // Set the token dynamically

        map = new mapboxgl.Map({
            container: 'map', // The ID of the map container in the HTML
            style: 'mapbox://styles/mapbox/streets-v11', // Map style
            center: [-0.09, 51.505], // Initial center [lng, lat]
            zoom: 13, // Initial zoom level
        });

        console.log("Mapbox map initialized successfully.");
    } catch (error) {
        console.error("Error initializing the map:", error);
        alert("Failed to initialize the map. Please try again.");
    }
}



// Add a new day
function addDay() {
    const dayNumber = itinerary.length + 1;
    const color = dayColors[(dayNumber - 1) % dayColors.length]; // Cycle through colors if there are more days than colors
    const day = { name: `Day ${dayNumber}`, locations: [], color };
    itinerary.push(day);

    const option = document.createElement("option");
    option.value = dayNumber;
    option.textContent = `Day ${dayNumber}`;
    daySelector.appendChild(option);

    const dayDiv = document.createElement("div");
    dayDiv.className = "day";
    dayDiv.id = `day-${dayNumber}`;
    dayDiv.innerHTML = `<h3 style="color:${color}">${day.name}</h3><ul id="day-locations-${dayNumber}"></ul>`;
    daysContainer.appendChild(dayDiv);
}

// Add a location
async function addLocation() {
    const name = document.getElementById("locationName").value;
    const time = document.getElementById("locationTime").value;
    const dayNumber = parseInt(daySelector.value);
    const travelMode = document.getElementById("travelMode").value; // Get selected travel mode

    if (!name || !dayNumber) {
        alert("Please enter a location name and select a day.");
        return;
    }

    try {
        const response = await fetch('/get-lat-lng', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationName: name }),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch location data: ${response.statusText}`);
        }

        const { lat, lng } = await response.json();
        if (!lat || !lng) {
            throw new Error("Invalid latitude or longitude received from server.");
        }

        const day = itinerary[dayNumber - 1];
        const location = { name, time, lat, lng, travelMode };

        // Add marker and store reference
        const marker = new mapboxgl.Marker({ color: day.color })
            .setLngLat([lng, lat])
            .setPopup(new mapboxgl.Popup().setHTML(`<strong>${name}</strong><br>${time || 'No time specified'}<br>Travel: ${travelMode}`))
            .addTo(map);

        location.marker = marker; // Store marker in location object
        day.locations.push(location);

        updateItinerary(dayNumber);
        drawRoute(dayNumber);
    } catch (error) {
        console.error("Error adding location:", error);
        alert("Failed to add location. Please try again.");
    }
}




// Draw route for a day
async function drawRoute(dayNumber) {
    const day = itinerary[dayNumber - 1];
    const latLngs = day.locations.map(loc => [loc.lng, loc.lat]); // Mapbox expects [lng, lat]

    if (latLngs.length > 1) {
        try {
            const travelMode = day.locations[0]?.travelMode === "metro" ? "walking" : day.locations[0]?.travelMode || "driving"; // Metro fallback
            const coordinates = latLngs.map(coord => coord.join(',')).join(';');

            const response = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/${travelMode}/${coordinates}?geometries=geojson&access_token=${mapboxgl.accessToken}`
            );

            if (!response.ok) {
                throw new Error("Failed to fetch route from Mapbox.");
            }

            const data = await response.json();
            const route = data.routes[0].geometry; // GeoJSON line for the route

            // Add route to the map
            const routeLayerId = `route-day-${dayNumber}`;

            // Remove existing layer if it exists
            if (map.getLayer(routeLayerId)) {
                map.removeLayer(routeLayerId);
                map.removeSource(routeLayerId);
            }

            map.addSource(routeLayerId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: route,
                },
            });

            map.addLayer({
                id: routeLayerId,
                type: 'line',
                source: routeLayerId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round',
                },
                paint: {
                    'line-color': day.color,
                    'line-width': 4,
                },
            });

        } catch (error) {
            console.error("Error drawing route:", error);
            alert("Failed to draw route. Please try again.");
        }
    }
}




// Update itinerary view
function updateItinerary(dayNumber) {
    const day = itinerary[dayNumber - 1];
    const dayList = document.getElementById(`day-locations-${dayNumber}`);

    // Sort locations by time
    day.locations.sort((a, b) => {
        if (!a.time) return 1; // Place entries without time at the end
        if (!b.time) return -1;
        return a.time.localeCompare(b.time); // Sort by time (HH:mm format)
    });

    dayList.innerHTML = "";

    day.locations.forEach((loc, index) => {
        const locationItem = document.createElement("li");
        locationItem.className = "location";
        locationItem.innerHTML = `
            ${loc.name} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}) at ${loc.time || "No time specified"}<br>
            Travel: ${loc.travelMode || "N/A"}
            <button onclick="removeLocation(${dayNumber}, ${index})">Remove</button>
        `;
        dayList.appendChild(locationItem);
    });

    // Update the route after sorting
    drawRoute(dayNumber);
}


// Make removeLocation accessible globally for dynamic buttons
window.removeLocation = removeLocation;


// Remove a location
function removeLocation(dayNumber, locationIndex) {
    const day = itinerary[dayNumber - 1];
    const location = day.locations[locationIndex];

    if (location.marker) {
        console.log("Removing marker:", location.marker);
        location.marker.remove(); // Remove marker from the map
    } else {
        console.error("Marker not found for location:", location);
    }

    // Remove the location from the itinerary
    day.locations.splice(locationIndex, 1);

    // Update the itinerary and directions
    updateItinerary(dayNumber);
}





// Save itinerary as a plan
function savePlan() {
    const planName = prompt("Enter a name for this plan:");
    if (!planName) {
        alert("Plan name is required!");
        return;
    }

    const saveData = itinerary.map(day => ({
        name: day.name,
        color: day.color,
        locations: day.locations.map(({ name, lat, lng, time, travelMode }) => ({ name, lat, lng, time, travelMode })),
    }));
    

    console.log("Saving plan:", planName, saveData);

    fetch(`/save-plan/${encodeURIComponent(planName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveData),
    })
        .then(res => {
            if (res.ok) {
                alert(`Plan "${planName}" saved successfully!`);
            } else {
                console.error("Error saving plan:", res);
                alert("Error saving the plan.");
            }
        })
        .catch(err => {
            console.error("Error during savePlan:", err);
            alert("Error saving the plan.");
        });
}

// Load a saved plan
function loadPlan() {
    const planName = prompt("Enter the name of the plan to load:");
    if (!planName) {
        alert("Plan name is required!");
        return;
    }

    fetch(`/load-plan/${encodeURIComponent(planName)}`)
        .then(res => res.json())
        .then(data => {
            itinerary.length = 0; // Clear existing itinerary
            daysContainer.innerHTML = "";
            daySelector.innerHTML = '<option value="">Select Day</option>';

            data.forEach((day, index) => {
                const loadedDay = { name: day.name, color: day.color, locations: [] };
            
                day.locations.forEach(loc => {
                    const marker = new mapboxgl.Marker({ color: day.color })
                        .setLngLat([loc.lng, loc.lat])
                        .setPopup(new mapboxgl.Popup().setHTML(`<strong>${loc.name}</strong><br>${loc.time || 'No time specified'}<br>Travel: ${loc.travelMode}`))
                        .addTo(map);
            
                    loc.marker = marker;
                    loadedDay.locations.push(loc);
                });
            
                itinerary.push(loadedDay);
                updateItinerary(index + 1);
                drawRoute(index + 1);
            });
            
        

            alert(`Plan "${planName}" loaded successfully!`);
        })
        .catch(err => {
            console.error("Error loading plan:", err);
            alert("Error loading the plan.");
        });
}

// Event listeners
document.getElementById("addDay").addEventListener("click", addDay);
document.getElementById("addLocation").addEventListener("click", addLocation);
document.getElementById("savePlan").addEventListener("click", savePlan);
document.getElementById("loadPlan").addEventListener("click", loadPlan);

// document.getElementById("scrollLeft").addEventListener("click", () => {
//     document.getElementById("daysContainer").scrollBy({ left: -200, behavior: "smooth" });
// });

// document.getElementById("scrollRight").addEventListener("click", () => {
//     document.getElementById("daysContainer").scrollBy({ left: 200, behavior: "smooth" });
// });


// Initialize the map
initMap();
