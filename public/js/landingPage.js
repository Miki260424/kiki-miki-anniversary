let divTime = document.getElementById("timeTogether");
let spanYear = document.getElementById("spanYear");
let spanMonth = document.getElementById("spanMonth");
let spanDay = document.getElementById("spanDay");
let spanHour = document.getElementById("spanHour");
let spanMinute = document.getElementById("spanMinute");
let spanSecond = document.getElementById("spanSecond");
const TimeTogether = {
  year: 2024,
  month: 4,
  day: 26,
  hour: 21,
  minute: 50,
  second: 30,
};
function countTime() {

  const now = new Date();

  let time = {
    year: now.getFullYear() - TimeTogether.year,
    month: now.getMonth() + 1 - TimeTogether.month,
    day: now.getDate() - TimeTogether.day,
    hour: now.getHours() - TimeTogether.hour,
    minute: now.getMinutes() - TimeTogether.minute,
    second: now.getSeconds() - TimeTogether.second,
  };

  if (time.second < 0) {
    time.minute--;
    time.second += 60;
  }

  if (time.minute < 0) {
    time.hour--;
    time.minute += 60;
  }

  if (time.hour < 0) {
    time.day--;
    time.hour += 24;
  }

  if (time.day < 0) {
    time.month--;

    let borrowedMonth = now.getMonth();
    let borrowedYear = now.getFullYear();
    if(borrowedMonth === 0){
      borrowedMonth = 12;
      borrowedYear--;
    }


    switch (borrowedMonth) {
      case 1:
      case 3:
      case 5:
      case 7:
      case 8:
      case 10:
      case 12:
        time.day += 31;
        break;
      case 4:
      case 6:
      case 9:
      case 11:
        time.day += 30;
        break;
      case 2:
        if (
          (borrowedYear % 4 === 0 && borrowedYear % 100 !== 0) ||
          borrowedYear % 400 === 0
        ) {
          time.day += 29;
        } else {
          time.day += 28;
        }
        break;
    }
  }
  if (time.month < 0) {
    time.year--;
    time.month += 12;
  }
  calculatingTime(time);
}

function calculatingTime(time) {
  // Year calculation

  time.year === 1
    ? (spanYear.textContent = time.year + " year")
    : (spanYear.textContent = time.year + " years");

  // Month calculation

  time.month === 1
    ? (spanMonth.textContent = time.month + " month")
    : (spanMonth.textContent = time.month + " months");

  // Day calculation

  time.day === 1
    ? (spanDay.textContent = time.day + " day")
    : (spanDay.textContent = time.day + " days");

  // Hour calculation

  time.hour === 1
    ? (spanHour.textContent = time.hour + " hour")
    : (spanHour.textContent = time.hour + " hours");

  // Minute calculation

  time.minute === 1
    ? (spanMinute.textContent = time.minute + " minute")
    : (spanMinute.textContent = time.minute + " minutes");

  // Second calculation

  time.second === 1
    ? (spanSecond.textContent = time.second + " second")
    : (spanSecond.textContent = time.second + " seconds");
}

countTime();

setInterval(countTime, 1000);

// spin the wheel

let spinTheWheel = document
  .getElementById("spin")
  .addEventListener("click", spining);
let openEnvelopeTransition = document.getElementById("openEnvelopeTransition");
let messageOfTheSpin = document.getElementById("messageOfTheSpin");
let backgroundOfEnvelope = document.getElementById("backgroundOfEnvelope");
let message = document.getElementById("message");
let upTriangle = document.getElementById("upTriangle");
let bigCircle = document.getElementById("bigCircle");
let mainReason = document.getElementById("mainReason");

// ете ги прачините ги најде сега хепи си???

const result = [
  "1. Кога прв пат те видов знаев дека си ти таа ",
  "24. Бебенце 2 години, не ми се верва ",
  "23. Требаше побрзо да се запознајме",
  "22. Те сакам Кикица ",
  "21. Цвеќиња за Најубавото чупе 💐🌸🌺🌹🌷🌼",
  "20. Наши зборој кои само ние ги разбираме: Малата мечка, Мастики...",
  "19. Пуфлакис ТЕ САКАМ",
  "18. Кикица моја мила каде ли си се скрила hahaha😂",
  "17. Охрид беше магичен одмор, а жива вода се вративме во апартманот",
  "16. Во лето на одмор си одиме и сакаме многу да истражуваме",
  "15. Raft во историјата замина а за први мај се качивме на планина.",
  "14. Minecraft почнавме да играме и со мачки се наполнавме",
  "13. Вкола често си лежиме и музики си слушаме",
  "12. My Babygirl си ти, стално ќе сум тука дури не избројш до три",
  "11. На тест од мене препишваше а Кириана ко не виде ќе полудеше",//и на двајцата грешно ни беше
  "10. Во паркот на телефон ми се јави после игрите мали",
  "9. Во SkillUp чај ми напрај, а на икс-нула му немаше крај",
  "8. На олимписки игри изгуби, ама љубовте моја ја победи",
  "7. Лабело ми нудеше ако не те бацев ќе полудеше 😅",
  "6. Во куглана ќе одевме ама на лизгајнца завршивме",
  "5. Јагода се гледавме и на облаци летавме",
  "4. Ко ме победи за програмер на месец срцето ми го укради ❤️",
  "3. Кога трет пат те видов веќе се заљубив во тебе",
  "2. Кога втор пат те видов Чуствував нешто силно",
];
let clicked = false;
let totalRotation = 0;

function spining() {
  if (!clicked) {
    clicked = true;
    let number = Math.ceil(Math.random() * 1000);
    let rotation = 1140 + number;
    totalRotation += rotation;

    bigCircle.style.transform = `rotate(${totalRotation}deg)`;
    bigCircle.style.transition = "all 2s ease-in-out";
  }
}
let header = document.querySelector("header");

bigCircle.addEventListener("transitionend", function () {
  setTimeout(() => {
    let finalAngle = totalRotation % 360;
    let normalizedAngle = (360 - finalAngle) % 360;
    let adjustedAngle = (finalAngle + 7.5) % 360;
    let segmantIndex = Math.floor(adjustedAngle / 15);

    const startEnvelopeAnimation = () => {
      if (window.innerWidth <= 1056) {
        document.body.style.overflow = "hidden";
        document.getElementById("spinText").style.display = "flex";
        header.classList.add("hideHeader");
      }

      openEnvelopeTransition.classList.remove("rotateCloseAnimation");
      openEnvelopeTransition.classList.add("rotateOpenAnimation");
      backgroundOfEnvelope.classList.add("backgroundEnvelopeUpAnimation");
      message.classList.add("fadeInAnimation");
      setTimeout(() => {
        messageOfTheSpin.classList.add("paperUpAnimation");
        setTimeout(() => {
          messageOfTheSpin.classList.remove("paperUpAnimation");
          messageOfTheSpin.classList.add("paperDownAnimation");
          setTimeout(() => {
            backgroundOfEnvelope.classList.remove(
              "backgroundEnvelopeUpAnimation",
            );
            backgroundOfEnvelope.classList.add(
              "backgroundEnvelopeDownAnimation",
            );
            backgroundOfEnvelope.classList.remove(
              "backgroundEnvelopeDownAnimation",
            );
            openEnvelopeTransition.classList.remove("rotateOpenAnimation");
            messageOfTheSpin.classList.remove("paperDownAnimation");
            openEnvelopeTransition.classList.add("rotateCloseAnimation");
            message.classList.remove("fadeInAnimation");

            setTimeout(() => {
              if (window.innerWidth <= 1056) {
                document.getElementById("spinText").style.display = "none";
                header.classList.remove("hideHeader");
              }
              document.body.style.overflow = "";
            }, 2000);

            clicked = false;
          }, 2000);
        }, 4000);
      }, 2000);

      mainReason.textContent = result[segmantIndex];
      console.log(
        "Final:",
        finalAngle,
        "Adjusted:",
        adjustedAngle,
        "Index:",
        segmantIndex,
      );
    };

    startEnvelopeAnimation();
    // upTriangle.style.backgroundColor = "blue";
  }, 500);
});

window.addEventListener("resize", () => {
  const spinText = document.getElementById("spinText");
  if (window.innerWidth > 1056) {
    spinText.style.display = "flex"; // always visible
    spinText.style.background = "none";
  } else {
    spinText.style.display = "none"; // always visible
    spinText.style.background = "radial-gradient(rgba(39, 39, 39, 0.7))";
  }
});

// loader is managed only by landing-loader.js

// heart animation
// Add floating hearts animation
function createFloatingHeart() {
  const heart = document.createElement("div");
  heart.innerHTML = "💖";
  heart.style.position = "fixed";
  heart.style.left = Math.random() * 100 + "vw";
  heart.style.top = "100vh";
  heart.style.fontSize = Math.random() * 20 + 15 + "px";
  heart.style.zIndex = "1";
  heart.style.pointerEvents = "none";
  heart.style.opacity = "0.7";
  heart.style.animation = "floatUp 6s linear forwards";

  document.body.appendChild(heart);

  setTimeout(() => {
    heart.remove();
  }, 6000);
}

// Add CSS for floating hearts
const style = document.createElement("style");
style.textContent = `
        @keyframes floatUp {
            0% {
                transform: translateY(0) translateX(0) rotate(0deg);
                opacity: 0.7;
            }
            50% {
                opacity: 1;
            }
            100% {
                transform: translateY(-100vh) translateX(${Math.random() * 200 - 100}px) rotate(360deg);
                opacity: 0;
            }
        }
    `;
document.head.appendChild(style);

// Create floating hearts periodically
setInterval(createFloatingHeart, 2000);

let toggelMenu = document.getElementById("colectionOfDrop");
let menuChange = document.getElementById("menuChange");
let shadow = document.getElementById("shadow");

document.getElementById("menu").addEventListener("click", function () {
  // header.style.height = header.style.height === "400px" ? "90px" : "400px";
  const isOpen = header.classList.toggle("menu-open");

  if (isOpen) {
    menuChange.setAttribute("src", "sliki/icons/close.png");
    setTimeout(() => {
      toggelMenu.style.display = "block";
    }, 150);
    openShadow();
  } else {
    menuChange.setAttribute("src", "sliki/icons/burgerBig.png");
    toggelMenu.style.display = "none";
    closeShadow();
  }

  menuChange.classList.add("rotateMenuNow");

  menuChange.addEventListener("animationend", () => {
    menuChange.classList.remove("rotateMenuNow");
  });
});

function openShadow() {
  shadow.style.display = "block";
  document.body.style.overflow = "hidden";
}
function closeShadow() {
  shadow.style.display = "none";
  document.body.style.overflow = "";
}

let cards = document.querySelectorAll(".pointShow").forEach((card) => {
  card.addEventListener("mouseover", function () {
    card.classList.add("animatedCards");
  });
  card.addEventListener("mouseleave", function () {
    setTimeout(() => {
      card.classList.remove("animatedCards");
    }, 1000);
    card.classList.add("mouseleaveClass");
  });
});

// logout
document.querySelectorAll(".logOut").forEach((btn) => {
  btn.addEventListener("click", () => {
    let loggedIn = sessionStorage.getItem("loggedIn");
    auth.signOut().then(() => window.location.replace("index.html"));
  });
});
