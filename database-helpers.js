// Database Helper Functions
// Firebase: Text data (songs, movies, memories metadata)
// Cloudinary: Images

// ===== AUTHENTICATION CHECK =====
function checkAuthentication() {
  const loggedIn = sessionStorage.getItem("loggedIn");
  if (loggedIn !== "true") {
    window.location.replace("index.html");
  }
}

// ===== FAVOURITE SONGS =====

async function addFavouriteSong(songData) {
  try {
    const docRef = await db.collection("songs").add({
      name: songData.name,
      artist: songData.artist || "",
      spotifyUrl: songData.spotifyUrl || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Song added:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error adding song:", error);
    throw error;
  }
}

async function getAllSongs() {
  try {
    const snapshot = await db
      .collection("songs")
      .orderBy("createdAt", "desc")
      .get();

    const songs = [];
    snapshot.forEach((doc) => {
      songs.push({
        id: doc.id,
        name: doc.data().name,
        artist: doc.data().artist,
        spotifyUrl: doc.data().spotifyUrl,
        type: "song",
      });
    });

    return songs;
  } catch (error) {
    console.error("❌ Error getting songs:", error);
    return [];
  }
}

async function deleteSong(songId) {
  try {
    await db.collection("songs").doc(songId).delete();
    console.log("✅ Song deleted");
  } catch (error) {
    console.error("❌ Error deleting song:", error);
    throw error;
  }
}

// ===== FAVOURITE MOVIES =====

async function addFavouriteMovie(movieData) {
  try {
    let posterUrl = "";

    // Upload poster to Cloudinary if provided
    if (movieData.posterFile) {
      console.log("📤 Uploading movie poster to Cloudinary...");
      posterUrl = await uploadImageToCloudinary(
        movieData.posterFile,
        "movie-posters",
      );
    }

    const docRef = await db.collection("movies").add({
      name: movieData.name,
      year: movieData.year || null,
      posterUrl: posterUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Movie added:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error adding movie:", error);
    throw error;
  }
}

async function getAllMovies() {
  try {
    const snapshot = await db
      .collection("movies")
      .orderBy("createdAt", "desc")
      .get();

    const movies = [];
    snapshot.forEach((doc) => {
      movies.push({
        id: doc.id,
        name: doc.data().name,
        year: doc.data().year,
        posterUrl: doc.data().posterUrl,
        type: "movie",
      });
    });

    return movies;
  } catch (error) {
    console.error("❌ Error getting movies:", error);
    return [];
  }
}

async function deleteMovie(movieId) {
  try {
    await db.collection("movies").doc(movieId).delete();
    console.log("✅ Movie deleted");
  } catch (error) {
    console.error("❌ Error deleting movie:", error);
    throw error;
  }
}

// ===== TIMELINE MEMORIES =====

async function addMemory(memoryData) {
  try {
    let imageUrl = "";

    // Upload image to Cloudinary if provided
    if (memoryData.image) {
      console.log("📤 Uploading memory image to Cloudinary...");
      imageUrl = await uploadImageToCloudinary(memoryData.image, "memories");
    }

    // Save text data to Firebase
    async function addMemory(memoryData) {
      const docRef = await db.collection("memories").add({
        title: memoryData.title,
        city: memoryData.city || "", // ← ADDED
        place: memoryData.place || "", // ← ADDED
        country: memoryData.country || "", // ← ADDED
        description: memoryData.description || "",
        date: memoryData.date,
        imageUrl: imageUrl,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log("✅ Memory added to Firebase:", docRef.id);
    if (imageUrl) {
      console.log("✅ Image saved to Cloudinary:", imageUrl);
    }

    return docRef.id;
  } catch (error) {
    console.error("❌ Error adding memory:", error);
    throw error;
  }
}

// Get memories sorted by creation time
async function getAllMemoriesByCreated() {
  try {
    const snapshot = await db
      .collection("memories")
      .orderBy("createdAt", "asc")
      .get();

    const memories = [];
    snapshot.forEach((doc) => {
      memories.push({
        id: doc.id,
        title: doc.data().title,
        description: doc.data().description,
        date: doc.data().date,
        imageUrl: doc.data().imageUrl,
      });
    });

    return memories;
  } catch (error) {
    console.error("❌ Error getting memories:", error);
    return [];
  }
}

// Get memories sorted by date
async function getAllMemoriesByDate(ascending = true) {
  try {
    const snapshot = await db
      .collection("memories")
      .orderBy("date", ascending ? "asc" : "desc")
      .get();

    const memories = [];
    snapshot.forEach((doc) => {
      memories.push({
        id: doc.id,
        title: doc.data().title,
        description: doc.data().description,
        date: doc.data().date,
        imageUrl: doc.data().imageUrl,
      });
    });

    return memories;
  } catch (error) {
    console.error("❌ Error getting memories:", error);
    return [];
  }
}

// Legacy function for backwards compatibility
async function getAllMemories() {
  return await getAllMemoriesByCreated();
}

async function deleteMemory(memoryId) {
  try {
    await db.collection("memories").doc(memoryId).delete();
    console.log("✅ Memory deleted from Firebase");
  } catch (error) {
    console.error("❌ Error deleting memory:", error);
    throw error;
  }
}

// ===== COMBINED FUNCTIONS =====

async function getAllFavourites() {
  try {
    const [songs, movies] = await Promise.all([getAllSongs(), getAllMovies()]);

    return [...songs, ...movies];
  } catch (error) {
    console.error("❌ Error getting all favourites:", error);
    return [];
  }
}

console.log("✅ Database helpers loaded!");
console.log("   Text data → Firebase");
console.log("   Images → Cloudinary");
