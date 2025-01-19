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
    const response = await fetch("/config");
    if (!response.ok) {
      throw new Error("Failed to fetch Mapbox configuration.");
    }

    const { mapboxToken } = await response.json();
    mapboxgl.accessToken = mapboxToken; // Set the token dynamically

    map = new mapboxgl.Map({
      container: "map", // The ID of the map container in the HTML
      style: "mapbox://styles/mapbox/streets-v11", // Map style
      center: [-3.199998, 55.94946], // Initial center [lng, lat]
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
  const notes = document.getElementById("locationNotes").value;
  const dayNumber = parseInt(daySelector.value);
  const travelMode = document.getElementById("travelMode").value;

  if (!name || !dayNumber) {
    alert("Please enter a location name and select a day.");
    return;
  }

  try {
    const response = await fetch("/get-lat-lng", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const location = { name, time, notes, lat, lng, travelMode };

    // Add marker and store reference
    const marker = new mapboxgl.Marker({ color: day.color })
      .setLngLat([lng, lat])
      .setPopup(
        new mapboxgl.Popup().setHTML(
          `<strong>${name}</strong><br>${time || "No time specified"}
           <br>Notes: ${notes || "None"}
           <br>Travel: ${travelMode}`
        )
      )
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

  // If there's fewer than 2 locations, there's no route to draw.
  if (day.locations.length < 2) return;

  // First, remove any existing layer(s) for this day.
  removeExistingDayLayers(dayNumber);

  // Go through each pair of consecutive locations
  for (let i = 0; i < day.locations.length - 1; i++) {
    const start = day.locations[i];
    const end = day.locations[i + 1];

    let mode = start.travelMode;
    // If mode is 'flying', just draw a straight line
    if (mode === "flying") {
      drawStraightLine(dayNumber, i, start, end, day.color);
      continue;
    }

    // For valid Mapbox Directions modes: walking, driving, cycling, transit
    if (!["walking", "driving", "cycling", "transit"].includes(mode)) {
      console.warn(`Unsupported travel mode: ${mode}. Defaulting to "driving".`);
      mode = "driving";
    }

    // Build the coordinates for Mapbox
    const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coordinates}?geometries=geojson&access_token=${mapboxgl.accessToken}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Mapbox Directions error:", errorData);
        continue; // Skip this leg
      }

      const data = await response.json();
      const route = data.routes[0]?.geometry;
      if (route) {
        drawGeoJsonLine(route, dayNumber, i, day.color);
      }
    } catch (err) {
      console.error("Error fetching route:", err);
    }
  }
}

// Draw the line from the Directions API
function drawGeoJsonLine(route, dayNumber, legIndex, color) {
  const routeLayerId = `route-day-${dayNumber}-leg-${legIndex}`;

  // Add the source
  map.addSource(routeLayerId, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: route,
    },
  });

  // Add the layer
  map.addLayer({
    id: routeLayerId,
    type: "line",
    source: routeLayerId,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": color,
      "line-width": 4,
    },
  });
}

// Remove existing day layers before drawing new ones
function removeExistingDayLayers(dayNumber) {
  // We don't know how many legs there are, so be cautious.
  // For each day, check possible route IDs: route-day-[dayNumber]-leg-[legIndex]
  // You might store the total leg count in day.locations.length - 1, but to be safe, loop a range:
  const maxLegs = itinerary[dayNumber - 1].locations.length - 1;
  for (let i = 0; i < maxLegs + 5; i++) {
    const routeLayerId = `route-day-${dayNumber}-leg-${i}`;
    if (map.getLayer(routeLayerId)) {
      map.removeLayer(routeLayerId);
    }
    if (map.getSource(routeLayerId)) {
      map.removeSource(routeLayerId);
    }
  }
}

// Draw a straight line for "flying"
function drawStraightLine(dayNumber, legIndex, start, end, color) {
  const lineData = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [start.lng, start.lat],
        [end.lng, end.lat],
      ],
    },
  };
  const routeLayerId = `route-day-${dayNumber}-leg-${legIndex}`;

  // Add the source
  map.addSource(routeLayerId, {
    type: "geojson",
    data: lineData,
  });

  // Add the layer
  map.addLayer({
    id: routeLayerId,
    type: "line",
    source: routeLayerId,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": color,
      "line-width": 4,
    },
  });
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
        Notes: ${loc.notes || "None"}<br>
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

  const saveData = itinerary.map((day) => ({
    name: day.name,
    color: day.color,
    locations: day.locations.map(
      ({ name, lat, lng, time, travelMode, notes }) => ({
        name,
        lat,
        lng,
        time,
        travelMode,
        notes,
      })
    ),
  }));

  fetch(`/save-plan/${encodeURIComponent(planName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(saveData),
  })
    .then((res) => {
      if (res.ok) {
        alert(`Plan "${planName}" saved successfully!`);
      } else {
        alert("Error saving the plan.");
      }
    })
    .catch((err) => {
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
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load plan: ${res.statusText}`);
      }
      return res.json();
    })
    .then((data) => {
      if (!Array.isArray(data)) {
        throw new Error("Invalid plan format: Expected an array of days.");
      }

      // Clear existing itinerary
      itinerary.length = 0;
      daysContainer.innerHTML = "";
      daySelector.innerHTML = '<option value="">Select Day</option>';

      data.forEach((day, index) => {
        if (!day.name || !day.color || !Array.isArray(day.locations)) {
          throw new Error(
            `Invalid day format at index ${index}: ${JSON.stringify(day)}`
          );
        }

        const loadedDay = { name: day.name, color: day.color, locations: [] };

        day.locations.forEach((loc) => {
          if (loc.name == null || loc.lat == null || loc.lng == null) {
            throw new Error(`Invalid location format: ${JSON.stringify(loc)}`);
          }

          const marker = new mapboxgl.Marker({ color: day.color })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(
              new mapboxgl.Popup().setHTML(`
                <strong>${loc.name}</strong><br>
                ${loc.time || "No time specified"}<br>
                Notes: ${loc.notes || "None"}<br>
                Travel: ${loc.travelMode || "N/A"}
              `)
            )
            .addTo(map);

          loc.marker = marker;
          loadedDay.locations.push(loc);
        });

        itinerary.push(loadedDay);

        // Add to the day selector
        const option = document.createElement("option");
        option.value = index + 1;
        option.textContent = day.name;
        daySelector.appendChild(option);

        // Add to the days container
        const dayDiv = document.createElement("div");
        dayDiv.className = "day";
        dayDiv.id = `day-${index + 1}`;
        dayDiv.innerHTML = `<h3 style="color:${day.color}">${day.name}</h3><ul id="day-locations-${index + 1}"></ul>`;
        daysContainer.appendChild(dayDiv);

        updateItinerary(index + 1); // Populate itinerary
      });

      alert(`Plan "${planName}" loaded successfully!`);
    })
    .catch((err) => {
      console.error("Error loading plan:", err);
      alert(`Error loading the plan: ${err.message}`);
    });
}

// Initialize the map on page load
initMap();

// Event listeners
document.getElementById("addDay").addEventListener("click", addDay);
document.getElementById("addLocation").addEventListener("click", addLocation);
document.getElementById("savePlan").addEventListener("click", savePlan);
document.getElementById("loadPlan").addEventListener("click", loadPlan);
