const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Save a plan
app.post("/save-plan/:name", (req, res) => {
    const planName = req.params.name;
    const planData = req.body;

    if (!planName || !planData) {
        return res.status(400).send("Invalid plan data.");
    }

    const filePath = path.join(__dirname, "data", `${planName}.json`);
    fs.writeFile(filePath, JSON.stringify(planData, null, 2), (err) => {
        if (err) {
            console.error("Error saving plan:", err);
            return res.status(500).send("Failed to save the plan.");
        }
        res.status(200).send("Plan saved successfully.");
    });
});

// Load a plan
app.get("/load-plan/:name", (req, res) => {
    const planName = req.params.name;

    const filePath = path.join(__dirname, "data", `${planName}.json`);
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            console.error("Error loading plan:", err);
            return res.status(404).send("Plan not found.");
        }
        res.json(JSON.parse(data));
    });
});

app.post("/get-lat-lng", async (req, res) => {
    const { locationName } = req.body;

    if (!locationName) {
        console.error("No locationName provided.");
        return res.status(400).send("Location name is required.");
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a geocoding assistant. When provided with a location name, return the latitude and longitude of the location in JSON format. Ensure the output is strictly valid JSON with no additional text or commentary."
                },
                { role: "user", content: `Provide the latitude and longitude for ${locationName}.` }
            ]
        });

        const gptResponse = completion.choices[0].message.content;

        let locationData;
        try {
            locationData = JSON.parse(gptResponse);

            // Normalize the response keys
            const normalizedData = {
                lat: locationData.latitude || locationData.Latitude,
                lng: locationData.longitude || locationData.Longitude,
            };

            console.log("Normalized location data:", normalizedData);
            res.json(normalizedData);
        } catch (error) {
            console.error("Error parsing GPT response:", gptResponse, error);
            return res.status(500).send("Failed to parse GPT response.");
        }
    } catch (error) {
        console.error("Error fetching data from OpenAI:", error);
        res.status(500).send("Error retrieving location data.");
    }
});

// Mapbox API Key
app.get('/config', (req, res) => {
    res.json({ mapboxToken: process.env.MAPBOX_ACCESS_TOKEN });
});

// Serve the main HTML file
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
