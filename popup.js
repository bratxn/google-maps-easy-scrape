document.addEventListener('DOMContentLoaded', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const currentTab = tabs[0];
        const actionButton = document.getElementById('actionButton');
        const downloadCsvButton = document.getElementById('downloadCsvButton');
        const resultsTable = document.getElementById('resultsTable');
        const filenameInput = document.getElementById('filenameInput');

        if (currentTab && currentTab.url.includes("://www.google.com/maps/search")) {
            document.getElementById('message').textContent = "Let's scrape Google Maps!";
            actionButton.disabled = false;
            actionButton.classList.add('enabled');
        } else {
            const messageElement = document.getElementById('message');
            messageElement.innerHTML = '';
            const linkElement = document.createElement('a');
            linkElement.href = 'https://www.google.com/maps/search/';
            linkElement.textContent = "Go to Google Maps Search.";
            linkElement.target = '_blank';
            messageElement.appendChild(linkElement);

            actionButton.style.display = 'none';
            downloadCsvButton.style.display = 'none';
            filenameInput.style.display = 'none';
        }

        actionButton.addEventListener('click', function () {
            chrome.scripting.executeScript(
                {
                    target: { tabId: currentTab.id },
                    function: scrapeDataWithScroll,
                },
                function (results) {
                    while (resultsTable.firstChild) {
                        resultsTable.removeChild(resultsTable.firstChild);
                    }

                    // Define and add headers to the table
                    const headers = ['Title', 'Rating', 'Reviews', 'Phone', 'Website', 'Google Maps Link'];
                    const headerRow = document.createElement('tr');
                    headers.forEach(headerText => {
                        const header = document.createElement('th');
                        header.textContent = headerText;
                        headerRow.appendChild(header);
                    });
                    resultsTable.appendChild(headerRow);

                    // Add new results to the table
                    if (!results || !results[0] || !results[0].result) return;
                    results[0].result.forEach(function (item) {
                        const row = document.createElement('tr');
                        ['title', 'rating', 'reviewCount', 'phone', 'website', 'href'].forEach(function (key) {
                            const cell = document.createElement('td');
                            cell.textContent = item[key] || '';
                            row.appendChild(cell);
                        });
                        resultsTable.appendChild(row);
                    });

                    if (results && results[0] && results[0].result && results[0].result.length > 0) {
                        downloadCsvButton.disabled = false;
                    }
                }
            );
        });

        downloadCsvButton.addEventListener('click', function () {
            const csv = tableToCsv(resultsTable);
            let filename = filenameInput.value.trim();
            if (!filename) {
                filename = 'google-maps-data.csv';
            } else {
                filename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.csv';
            }
            downloadCsv(csv, filename);
        });
    });
});

// Function to scrape data with auto-scrolling
async function scrapeDataWithScroll() {
    const results = [];
    const resultsPane = document.querySelector('[role="feed"]'); // Google Maps results container

    // Helper function to scrape visible results
    const scrapeVisibleResults = () => {
        const links = Array.from(document.querySelectorAll('a[href^="https://www.google.com/maps/place"]'));
        return links.map(link => {
            const container = link.closest('[jsaction*="mouseover:pane"]');
            const titleText = container?.querySelector('.fontHeadlineSmall')?.textContent || '';
            const roleImgContainer = container?.querySelector('[role="img"]');
            let rating = '';
            let reviewCount = '';
            let website = '';

            // Extract rating and review count
            if (roleImgContainer) {
                const ariaLabel = roleImgContainer.getAttribute('aria-label');
                if (ariaLabel?.includes("stars")) {
                    const parts = ariaLabel.split(' ');
                    rating = parts[0];
                    reviewCount = parts[2] ? `(${parts[2]})` : '';
                }
            }

            // Extract website URL
            const allLinks = Array.from(container?.querySelectorAll('a[href]') || []);
            const websiteLink = allLinks.find(link => !link.href.startsWith("https://www.google.com/maps/place/"));
            if (websiteLink) {
                website = websiteLink.href;
            }

            // Extract phone number
            const phoneRegex = /(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
            const phone = container?.textContent.match(phoneRegex)?.[0] || '';

            return {
                title: titleText,
                rating,
                reviewCount,
                phone,
                website,
                href: link.href,
            };
        });
    };

    // Scroll results pane until "You've reached the end of the list."
    const scrollResultsPane = async () => {
        let previousHeight = resultsPane.scrollHeight;
        let attempts = 0; // Safety limit for scrolling

        while (true) {
            resultsPane.scrollTo(0, resultsPane.scrollHeight);
            await new Promise(r => setTimeout(r, 2000)); // Wait for new content to load

            const newHeight = resultsPane.scrollHeight;
            if (newHeight === previousHeight) {
                attempts++;
            } else {
                attempts = 0;
            }

            previousHeight = newHeight;
            results.push(...scrapeVisibleResults());

            const endMessage = document.querySelector('[role="heading"][aria-level="3"]');
            if (endMessage?.textContent.includes("You've reached the end of the list") || attempts >= 5) {
                break;
            }
        }
    };

    await scrollResultsPane();
    return results;
}

// Convert the table to a CSV string
function tableToCsv(table) {
    const csv = [];
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = Array.from(cols).map(col => `"${col.textContent}"`);
        csv.push(rowData.join(','));
    });

    return csv.join('\n');
}

// Download the CSV file
function downloadCsv(csv, filename) {
    const csvFile = new Blob([csv], { type: 'text/csv' });
    const downloadLink = document.createElement('a');
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
}
