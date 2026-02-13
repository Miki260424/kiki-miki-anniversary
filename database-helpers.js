// Database Helper Functions for Kiki + Miki Anniversary Website

// ==================== AUTHENTICATION ====================

// Check if user is authenticated (using the special date)
function checkAuthentication() {
  const loggedIn = sessionStorage.getItem("loggedIn");
  if (loggedIn !== "true") {
    window.location.replace("index.html");
  }
}

// ==================== MEMORY FUNCTIONS ====================

// Add a new memory to the timeline
async function addMemory(memoryData) {
  try {
    const docRef = await db.collection("memories").add({
      title: memoryData.title,
      city: memoryData.city,
      place: memoryData.place,
      date: memoryData.date,
      description: memoryData.description,
      imageUrl: memoryData.imageUrl || "",
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString(),
    });

    console.log("Memory added with ID: ", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error adding memory: ", error);
    throw error;
  }
}

// Upload image to Firebase Storage
async function uploadMemoryImage(file, memoryId) {
  try {
    const storageRef = storage.ref(`memories/${memoryId}/${file.name}`);
    const snapshot = await storageRef.put(file);
    const downloadURL = await snapshot.ref.getDownloadURL();

    console.log("Image uploaded successfully!");
    return downloadURL;
  } catch (error) {
    console.error("Error uploading image: ", error);
    throw error;
  }
}

// Get all memories from database
async function getAllMemories() {
  try {
    const snapshot = await db
      .collection("memories")
      .orderBy("date", "asc")
      .get();

    const memories = [];
    snapshot.forEach((doc) => {
      memories.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return memories;
  } catch (error) {
    console.error("Error getting memories: ", error);
    throw error;
  }
}

// Update a memory
async function updateMemory(memoryId, updatedData) {
  try {
    await db.collection("memories").doc(memoryId).update(updatedData);
    console.log("Memory updated successfully!");
  } catch (error) {
    console.error("Error updating memory: ", error);
    throw error;
  }
}

// Delete a memory
async function deleteMemory(memoryId) {
  try {
    await db.collection("memories").doc(memoryId).delete();
    console.log("Memory deleted successfully!");
  } catch (error) {
    console.error("Error deleting memory: ", error);
    throw error;
  }
}

// ==================== FAVOURITES FUNCTIONS ====================

// Add a favourite song
async function addFavouriteSong(songData) {
  try {
    const docRef = await db.collection("favourites").add({
      type: "song",
      name: songData.name,
      artist: songData.artist,
      albumArt: songData.albumArt || "",
      spotifyUrl: songData.spotifyUrl || "",
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("Favourite song added with ID: ", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error adding favourite: ", error);
    throw error;
  }
}

// Get all favourites
async function getAllFavourites() {
  try {
    const snapshot = await db.collection("favourites").get();

    const favourites = [];
    snapshot.forEach((doc) => {
      favourites.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return favourites;
  } catch (error) {
    console.error("Error getting favourites: ", error);
    throw error;
  }
}

// ==================== SPIN WHEEL REASONS ====================

// Add/Update reasons for spin wheel
async function updateSpinReasons(reasonsArray) {
  try {
    await db.collection("settings").doc("spinWheel").set({
      reasons: reasonsArray,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("Spin reasons updated successfully!");
  } catch (error) {
    console.error("Error updating spin reasons: ", error);
    throw error;
  }
}

// Get spin wheel reasons
async function getSpinReasons() {
  try {
    const doc = await db.collection("settings").doc("spinWheel").get();

    if (doc.exists) {
      return doc.data().reasons;
    } else {
      // Return default reasons if not found
      return [
        "Кога прв пат те видов знаев дека си ти таа",
        "Reason 2",
        "Reason 3",
        // ... add more default reasons
      ];
    }
  } catch (error) {
    console.error("Error getting spin reasons: ", error);
    throw error;
  }
}

// ==================== UTILITY FUNCTIONS ====================

// Real-time listener for memories (updates automatically)
function listenToMemories(callback) {
  return db
    .collection("memories")
    .orderBy("date", "asc")
    .onSnapshot((snapshot) => {
      const memories = [];
      snapshot.forEach((doc) => {
        memories.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      callback(memories);
    });
}

// Search for songs using Spotify API (optional)
async function searchSongs(query) {
  // This would require Spotify API integration
  // For now, just return the query for manual entry
  console.log("Searching for: " + query);
  // You can integrate Spotify API here later if needed
}
