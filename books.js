const STATUS_LABELS = {
  queued: "Queued",
  reading: "Reading",
  paused: "Paused",
  finished: "Finished",
  archive: "Archive",
};

const YEAR_NOTES = {
  2024: "I only started recording in October/November time of 2024, so this year's entry will always appear shorten than subsequent years'.",
};

const CURRENT_STATUSES = ["queued", "reading", "paused", "finished"];

const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const statsTarget = document.getElementById("stats");
const kanbanTarget = document.getElementById("kanban");
const archiveYears = document.getElementById("archive-years");
const archiveSection = document.getElementById("archive");
const finishedNote = document.getElementById("finished-note");
const emptyMessage = document.getElementById("empty");
const loadError = document.getElementById("load-error");
const filterButtons = document.querySelectorAll(".filters button");

let books = [];
let activeFilter = "all";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function normaliseBook(raw, status, year) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const title = String(raw.title || "").trim();
  const author = String(raw.author || "").trim();

  if (!title) {
    return null;
  }

  return {
    title,
    author,
    status,
    year: year || null,
    audio: Boolean(raw.audio),
    review: String(raw.review || "").trim(),
  };
}

function normaliseData(source) {
  const list = [];

  for (const status of CURRENT_STATUSES) {
    for (const item of asList(source[status])) {
      const book = normaliseBook(item, status, null);
      if (book) {
        list.push(book);
      }
    }
  }

  for (const group of asList(source.archive)) {
    const year = Number(group.year);
    for (const item of asList(group.books)) {
      const book = normaliseBook(item, "archive", Number.isFinite(year) ? year : null);
      if (book) {
        list.push(book);
      }
    }
  }

  return list;
}

function matchesQuery(book, query) {
  if (!query) {
    return true;
  }

  const haystack = [book.title, book.author, book.review]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesFilter(book) {
  if (activeFilter === "all") {
    return true;
  }

  if (activeFilter === "audio") {
    return book.audio;
  }

  return book.status === activeFilter;
}

function sortBooks(list) {
  const mode = sortSelect.value;
  const copy = list.slice();

  if (mode === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title, "en-GB", { sensitivity: "base" }));
  } else if (mode === "author") {
    const key = (author) => {
      const parts = author.trim().split(/\s+/);
      return parts.length ? parts[parts.length - 1] : author;
    };
    copy.sort((a, b) => {
      const authors = key(a.author).localeCompare(key(b.author), "en-GB", { sensitivity: "base" });
      return authors || a.title.localeCompare(b.title, "en-GB", { sensitivity: "base" });
    });
  }

  return copy;
}

function bookMarkup(book, { review = false } = {}) {
  const audio = book.audio
    ? ` <span class="audio-icon" title="Audiobook" aria-hidden="true"></span><span class="visually-hidden">audiobook</span>`
    : "";
  const author = book.author
    ? ` <span class="book-author">${escapeHtml(book.author)}</span>`
    : "";
  const note = review && book.review
    ? `<span class="review">${escapeHtml(book.review)}</span>`
    : "";

  return `<li><span class="book-title">${escapeHtml(book.title)}</span>${audio}${author}${note}</li>`;
}

function renderColumn(status, list) {
  const items = list.filter((book) => book.status === status);
  const body = items.length
    ? `<ul class="book-list">${items.map((book) => bookMarkup(book)).join("")}</ul>`
    : `<p class="empty-column">None just now.</p>`;

  return `
    <article class="column" data-status="${status}">
      <h3>${STATUS_LABELS[status]} <span class="count">(${items.length})</span></h3>
      ${body}
    </article>
  `;
}

function renderArchive(list) {
  const archived = list.filter((book) => book.status === "archive");
  const years = [];

  for (const book of archived) {
    if (!years.includes(book.year)) {
      years.push(book.year);
    }
  }

  if (sortSelect.value === "original") {
    years.sort((a, b) => (b || 0) - (a || 0));
  }

  return years.map((year) => {
    const items = archived.filter((book) => book.year === year);
    const label = year || "Undated";
    const note = YEAR_NOTES[year]
      ? `<aside class="year-note">${escapeHtml(YEAR_NOTES[year])}</aside>`
      : "";

    return `
      <div class="archive-year">
        <h3>${escapeHtml(String(label))} <span class="count">(${items.length})</span></h3>
        ${note}
        <ul class="archive-list">
          ${items.map((book) => bookMarkup(book, { review: true })).join("")}
        </ul>
      </div>
    `;
  }).join("");
}

function describeStats(visible, total) {
  const query = searchInput.value.trim();
  const parts = [
    `${total} book${total === 1 ? "" : "s"}`,
    `${books.filter((book) => book.status === "reading").length} reading`,
    `${books.filter((book) => book.status === "queued").length} queued`,
    `${books.filter((book) => book.status === "finished").length} finished`,
    `${books.filter((book) => book.status === "archive").length} in the archive`,
  ];

  if (query || activeFilter !== "all") {
    return `${visible.length} of ${total} books shown`;
  }

  return parts.join(" · ");
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = sortBooks(
    books.filter((book) => matchesFilter(book) && matchesQuery(book, query))
  );

  const querying = Boolean(query);
  const archiveItems = visible.filter((book) => book.status === "archive");
  const kanbanStatuses = CURRENT_STATUSES.filter((status) => {
    const hasMatch = visible.some((book) => book.status === status);
    if (activeFilter === "all") {
      return !querying || hasMatch;
    }
    if (activeFilter === "audio") {
      return hasMatch;
    }
    return activeFilter === status;
  });
  const showArchive = (
    activeFilter === "all" ||
    activeFilter === "archive" ||
    activeFilter === "audio"
  ) && (activeFilter === "archive" || archiveItems.length > 0 || !querying);

  kanbanTarget.innerHTML = kanbanStatuses.map((status) => renderColumn(status, visible)).join("");
  archiveYears.innerHTML = renderArchive(visible);

  const kanbanVisible = kanbanStatuses.length > 0;
  const archiveVisible = showArchive && (archiveItems.length > 0 || (activeFilter === "archive" && !querying));

  kanbanTarget.hidden = !kanbanVisible;
  finishedNote.hidden = !(kanbanVisible && (activeFilter === "all" || activeFilter === "finished"));
  archiveSection.hidden = !archiveVisible;
  emptyMessage.hidden = visible.length > 0 || kanbanVisible;
  statsTarget.textContent = describeStats(visible, books.length);
}

async function loadBooks() {
  const yaml = await import("https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm");
  const response = await fetch("books.yaml");

  if (!response.ok) {
    throw new Error(`Could not load books.yaml (${response.status}).`);
  }

  const source = yaml.load(await response.text(), { schema: yaml.JSON_SCHEMA });
  books = normaliseData(source);

  if (!books.length) {
    throw new Error("The books file is empty or invalid.");
  }
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((other) => {
      other.setAttribute("aria-pressed", String(other === button));
    });
    render();
  });
});

searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);

try {
  await loadBooks();
  render();
} catch (error) {
  console.error(error);
  loadError.hidden = false;
  loadError.textContent = error.message || "The book list could not be loaded.";
}
