const preview = document.getElementById("gameplay");
const video = preview.querySelector("video");

document.getElementById("watch").addEventListener("click", () => {
  preview.showModal();
  video.play().catch(() => {
    // The player still has native controls if the browser requires another tap.
  });
});

preview.addEventListener("close", () => {
  video.pause();
  video.currentTime = 0;
});

preview.addEventListener("click", (event) => {
  if (event.target === preview) preview.close();
});
