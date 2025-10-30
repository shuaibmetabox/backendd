// import the packages:
const express = require('express'); //to build server
const path = require('path'); //handle directory
const fetch = require('node-fetch'); //allow http request
const cors= require('cors'); //allows handle server on another domain
require('dotenv').config(); //loads .env in process.env

const app = express(); //initialise express app
const PORT = process.env.PORT || 3000; //use port from env or default(3000)

// For security in a real application, this should be loaded from an environment variable.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";
const MAX_RETRIES = 5; //import gemini key and url, and init max tries to fect from gemini

//Serve all static files to this link
// This handles index.html, motivation.css, and motivation.js.

app.use(cors({
    origin:[
        'http://localhost:5500',
        'https://motivationquotesgen.netlify.app'
    ],
    methods: ['GET'],
}));  //theses urls are allowed to use the backend, secure api


if (process.env.SERVE_STATIC==='true'){
    app.use(express.static(path.join(__dirname, 'public'))); 
} //in case we are serving from public folder locally
/*
Calls the Gemini API, asking for a structured motivational quote.
Implements exponential backoff for robust fetching.
*/
async function fetchQuoteFromGemini() {
    // 1. Define the structured output schema for what we expect (JSON)
    const responseSchema = {
        type: "OBJECT",
        properties: {
            "quote": { "type": "STRING", "description": "A single, highly inspirational motivational quote." },
            "author": { "type": "STRING", "description": "The attributed author of the quote." }
        },
        required: ["quote", "author"]
    };
    // 2. This is the message we send to gemini
    const payload = {
        contents: [{ parts: [{ text: "Generate a new, original, and highly inspirational motivational quote and its author. Be creative and unique." }] }],
        generationConfig: {
            // Request the response in JSON format based on the schema
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };

    //try to fetch up to 5 times
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {   //fetch from gemini the response in a POST request
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload), //converts to json
                timeout: 10000 
            });
            //if response is not ok, throw error
            if (!response.ok) {
                console.error(`API response failed with status: ${response.status}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json(); //gets result in json
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            //extracts the answers only from results

            if (jsonText) {
                // The API returns a JSON string, so parse it into a JavaScript object
                return JSON.parse(jsonText);
            } else {
                console.error("Gemini API returned an unexpected or empty response structure.");
                throw new Error("Invalid API response format.");
            }
        //else retry on failure up to 5 times
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed: ${error.message}`);
            if (attempt === MAX_RETRIES - 1) return null; // Final failure
            
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`Retrying in ${delay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// ✅ NEW: API route for the client-side JavaScript to call
app.get('/api/motivation', async (req, res) => { //for url domain/api/motivation
    const quoteData = await fetchQuoteFromGemini(); //fetches data

    if (quoteData && quoteData.quote && quoteData.author) {
        // SUCCESS: Send the structured quote data back as JSON
        res.json({
            quote: quoteData.quote,
            author: quoteData.author
        });
    } else {
        // FAILURE: Send an error status
        res.status(500).json({ 
            error: "Failed to fetch motivation from the Gemini API.",
            quote: "Error: The dynamic quote engine is temporarily unavailable. Try again!",
            author: "The Server Ghost"
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Serving files to https://motivationquotesgen.netlify.app/`);
});