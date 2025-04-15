// popup.js - Handles the UI logic for the extension popup window

document.getElementById("description").innerText = chrome.i18n.getMessage("extension_description");
document.getElementById("scanBtn").innerText = chrome.i18n.getMessage("scan_button");

const messageEl = document.getElementById("message");
const listEl = document.getElementById("scriptList");

const showMessage = (text, isError = false) => {
  messageEl.textContent = text;
  messageEl.className = isError ? "error" : "";
};

const collectScriptsFromPage = () => {
  const scripts = [];

  const perfEntries = performance.getEntriesByType("resource")
    .filter(entry => entry.initiatorType === "script");

  const domScripts = document.querySelectorAll('script[src]');
  domScripts.forEach(script => {
    scripts.push({
      name: script.src,
      type: "dom"
    });
  });

  perfEntries.forEach(entry => {
    scripts.push({
      name: entry.name,
      type: "performance"
    });
  });

  scripts.sort((a, b) => {
    const nameA = a.name.split('/').pop().split('?')[0].toLowerCase();
    const nameB = b.name.split('/').pop().split('?')[0].toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return scripts;
};

const getDomainFromUrl = (url) => {
  try {
    if (url.startsWith("blob:")) {
      const realUrl = url.replace("blob:", "");
      return `${new URL(realUrl).hostname} [BLOB]`;
    }
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
};

const getFileNameFromUrl = (url) => url.split('/').pop().split('?')[0];

const isDuplicated = (script, scripts) => {
  const count = scripts.filter(s => s.name === script.name && s.type === script.type).length;
  return count > 1;
};

const displayResults = (data, format = "groupedByDomain") => {
  if (!data || data.length === 0) {
    throw new Error(chrome.i18n.getMessage("error_no_result") || "Unable to get the analysis result.");
  }

  if (format === "groupedByDomain") {
    const groupedByDomain = data.reduce((acc, script) => {
      const domain = getDomainFromUrl(script.name);
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push(script);
      return acc;
    }, {});

    const sortedDomains = Object.keys(groupedByDomain).sort((a, b) => a.localeCompare(b));

    sortedDomains.forEach(domain => {
      const domainEl = document.createElement("li");
      domainEl.className = "row-title";
      domainEl.textContent = domain;
      listEl.appendChild(domainEl);

      const groupByDomain = document.createElement("li");
      groupByDomain.className = "row-content";

      const groupByDomainList = document.createElement("ul");

      groupedByDomain[domain].forEach(script => {
        const li = document.createElement("li");
        const scriptName = getFileNameFromUrl(script.name);

        if (isDuplicated(script, groupedByDomain[domain])) {
          li.classList.add("row-duplicated");
          li.textContent = `⚠️ ${scriptName} - (${script.type})`;
        } else {
          li.textContent = `${scriptName} - (${script.type})`;
        }

        li.setAttribute("title", script.name);
        groupByDomainList.appendChild(li);
      });

      groupByDomain.appendChild(groupByDomainList);
      listEl.appendChild(groupByDomain);

      const liSeparator = document.createElement("li");
      liSeparator.className = "row-separator";
      listEl.appendChild(liSeparator);
    });
  } else {
    const list = document.createElement("ul");

    data.forEach(script => {
      const li = document.createElement("li");
      const scriptName = getFileNameFromUrl(script.name);

      if (isDuplicated(script, data)) {
        li.classList.add("row-duplicated");
        li.textContent = `⚠️ ${scriptName} - (${script.type})`;
      } else {
        li.textContent = `${scriptName} - (${script.type})`;
      }

      list.appendChild(li);
    });

    listEl.appendChild(list);
  }
};

document.getElementById("scanBtn").addEventListener("click", async () => {
  try {
    messageEl.textContent = "";
    listEl.innerHTML = "";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      showMessage(chrome.i18n.getMessage("error_no_tab") || "Unable to access the active tab.", true);
      return;
    }

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: collectScriptsFromPage
    });

    if (!result || !result[0] || !result[0].result) {
      throw new Error(chrome.i18n.getMessage("error_no_result") || "Unable to get the analysis result.");
    }

    const allScripts = result.flatMap(r => r.result || []);
    displayResults(allScripts);
  } catch (err) {
    showMessage(`Error: ${err.message}`, true);
  }
});
