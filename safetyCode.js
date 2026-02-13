document.addEventListener("DOMContentLoaded", () => {
  let loggedIn = sessionStorage.getItem("loggedIn");
  if (loggedIn !== "true") {
    window.location.replace("index.html");
  } else {
    document.body.style.display = "block";
  }
});
