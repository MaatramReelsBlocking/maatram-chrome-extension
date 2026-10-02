const timer = document.getElementById("timer");
const site = document.getElementById("site");

let endTime = 0;

try {
  const params = new URLSearchParams(
    window.location.search
  );

  const domain = params.get("site");

  if (domain) {
    site.textContent = domain + " is locked";
  }
} catch (_) {}


function formatTime(ms) {

  const totalSeconds = Math.max(
    0,
    Math.ceil(ms / 1000)
  );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds =
    totalSeconds % 60;


  if (hours > 0) {

    return (
      String(hours).padStart(2, "0") +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0")
    );

  }


  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}


async function loadLockTime() {

  try {

    const data =
      await chrome.storage.local.get([
        "hardLockActive",
        "hardLockEndTime"
      ]);


    if (
      data.hardLockActive &&
      data.hardLockEndTime
    ) {

      endTime =
        Number(data.hardLockEndTime);

      updateTimer();

    } else {

      timer.textContent = "00:00";

    }

  } catch (error) {

    console.error(
      "Maatram timer error:",
      error
    );

  }

}


function updateTimer() {

  if (!endTime) {

    timer.textContent = "00:00";
    return;

  }


  const remaining =
    endTime - Date.now();


  if (remaining <= 0) {

    timer.textContent = "00:00";
    return;

  }


  timer.textContent =
    formatTime(remaining);

}


loadLockTime();


setInterval(
  updateTimer,
  1000
);


setInterval(
  loadLockTime,
  2000
);