(() => {
  "use strict";

  document.querySelectorAll("[data-training-directory]").forEach(directory => {
    const search = directory.querySelector("[data-training-search]");
    const category = directory.querySelector("[data-training-category]");
    const cards = [...directory.querySelectorAll("[data-training-topic]")];
    if (!search || !category || !cards.length) return;
    const status = directory.querySelector("[data-training-status]");
    const empty = directory.querySelector("[data-training-empty]");

    function filter() {
      const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      let visible = 0;
      cards.forEach(card => {
        const matches = words.every(word => card.textContent.toLocaleLowerCase().includes(word)) &&
          (!category.value || card.dataset.trainingCategoryName === category.value);
        card.hidden = !matches;
        if (matches) visible++;
      });
      status.textContent = `${visible} of ${cards.length} topics${directory.dataset.trainingDirectory === "coaching" ? ". Enquire to confirm availability." : "."}`;
      empty.hidden = visible !== 0;
    }

    if (directory.dataset.trainingDirectory === "coaching") {
      const topic = new URLSearchParams(window.location.search).get("topic");
      if (cards.some(card => card.dataset.trainingTopic === topic)) search.value = topic;
    }
    search.addEventListener("input", filter);
    category.addEventListener("change", filter);
    directory.querySelector("[data-training-reset]").addEventListener("click", () => {
      search.value = "";
      category.value = "";
      filter();
      search.focus();
    });
    directory.querySelector("[data-training-filters]").hidden = false;
    filter();
  });
})();
