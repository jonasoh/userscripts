// ==UserScript==
// @name         Prisma BibTeX Import
// @namespace    http://vansinne.se
// @version      0.1
// @description  Import BibTeX entries into Prisma publication form
// @match        https://prisma.research.se/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Parse BibTeX string into object
    function parseBibtex(text) {
        const entry = {};
        console.log("Parsing BibTeX:", text);
        
        // Extract everything between the first { and the last }
        const matches = text.match(/@(\w+)\s*{\s*([^,]*),\s*([\s\S]*)\s*\}/);
        if (!matches) {
            console.error("No valid BibTeX entry found");
            return null;
        }

        const [_, type, cite, content] = matches;
        entry.type = type.toLowerCase();
        entry.cite = cite;

        // Split content into fields while respecting nested braces
        let field = '';
        let braceLevel = 0;
        let inQuote = false;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '{') braceLevel++;
            else if (char === '}') braceLevel--;
            else if (char === '"') inQuote = !inQuote;
            
            if (char === ',' && braceLevel === 0 && !inQuote) {
                if (field.trim()) parseField(field.trim(), entry);
                field = '';
            } else {
                field += char;
            }
        }
        if (field.trim()) parseField(field.trim(), entry);

        console.log("Parsed BibTeX:", entry);
        return entry;
    }

    function parseField(field, entry) {
        const match = field.match(/^\s*(\w+)\s*=\s*(.+)\s*$/);
        if (!match) return;

        const [_, key, value] = match;
        let cleanValue = value.trim();
        
        // Remove surrounding braces/quotes and handle special characters
        cleanValue = cleanValue
            .replace(/^[{"]|[}"]$/g, '')  // Remove outer braces/quotes
            .replace(/\\&/g, '&')         // Handle escaped ampersands
            .replace(/\\_/g, '_')         // Handle escaped underscores
            .replace(/\\"/g, '"')         // Handle escaped quotes
            .replace(/\\'([aeiouAEIOU])/g, '$1') // Handle acute accents
            .replace(/\\`([aeiouAEIOU])/g, '$1') // Handle grave accents
            .replace(/\\~([aeiouAEIOU])/g, '$1') // Handle tildes
            .replace(/\\"([aeiouAEIOU])/g, '$1') // Handle umlauts
            .replace(/\s+/g, ' ');        // Normalize whitespace

        entry[key.toLowerCase()] = cleanValue;
    }

    // Split author names into first/last
    function splitAuthorName(authorStr) {
        const parts = authorStr.split(',');
        if (parts.length === 2) {
            return {
                firstName: parts[1].trim(),
                lastName: parts[0].trim()
            };
        }
        const words = authorStr.split(' ');
        return {
            firstName: words.slice(0, -1).join(' '),
            lastName: words[words.length - 1]
        };
    }

    // Add a helper function to handle promise-based delay
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Add a helper function to add an author and wait for row
    async function addAuthor(author, index) {
        console.log(`Adding author ${index}:`, author);
        
        return new Promise((resolve, reject) => {
            // Watch for changes in tbody
            const observer = new MutationObserver(() => {
                const tbody = document.querySelector('#AuthorsRows tbody');
                const rows = tbody.getElementsByTagName('tr');
                
                // Look for a row with our index
                for (const row of rows) {
                    const firstNameInput = row.querySelector(`input[id^="Authors_"][id$="_FirstName"]`);
                    const lastNameInput = row.querySelector(`input[id^="Authors_"][id$="_LastName"]`);
                    
                    // Check if this is a new unfilled row
                    if (firstNameInput && lastNameInput && !firstNameInput.value && !lastNameInput.value) {
                        const { firstName, lastName } = splitAuthorName(author);
                        console.log(`Setting author:`, { firstName, lastName });
                        
                        firstNameInput.value = firstName;
                        lastNameInput.value = lastName;
                        
                        [firstNameInput, lastNameInput].forEach(input => {
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                        
                        observer.disconnect();
                        resolve(true);
                        return;
                    }
                }
            });

            // Start observing before clicking
            const tbody = document.querySelector('#AuthorsRows tbody');
            observer.observe(tbody, { childList: true, subtree: true });

            // Click add button
            const addButton = document.querySelector('#btnAuthorAdd');
            if (addButton) {
                addButton.click();
            } else {
                observer.disconnect();
                reject('Add author button not found');
            }

            // Safety timeout
            setTimeout(() => {
                observer.disconnect();
                reject(`Timeout waiting for author row`);
            }, 1000);
        });
    }

    // Update the fillForm function to use async/await for authors
    async function fillForm(bibtex) {
        console.log("Filling form with:", bibtex);

        // Map BibTeX fields to form fields
        const fieldMap = {
            title: 'Title',
            journal: 'JournalName',
            volume: 'Volume', 
            number: 'IssueNumber',
            doi: 'Doi', // Fixed: Changed 'DOI' to 'Doi' to match the actual input ID
            year: 'PublicationDateString',
            abstract: 'Abstract',
            abstractnote: 'Abstract',
            issn: 'ISSN'
        };

        // Set peer-reviewed article type by default
        const pubTypeSelect = document.getElementById('PublicationType');
        if (pubTypeSelect) {
            pubTypeSelect.value = "ed93916b-1e88-4a12-bfac-aad3e74bf0fd"; // Vetenskaplig publikation - fackgranskade
            pubTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            // Wait for the change event to be processed
            await delay(100);
        }

        const pubFormSelect = document.getElementById('PublicationFormPeerReviewed');
        if (pubFormSelect) {
            pubFormSelect.value = "c252ca4a-fa7a-46dc-9cdc-057e2224ca50"; // Originalartikel i vetenskaplig tidskrift
            pubFormSelect.dispatchEvent(new Event('change', { bubbles: true }));
            // Wait for the change event to be processed
            await delay(100);
        }

        // Handle authors first before other fields
        if (bibtex.author) {
            console.log("Processing authors:", bibtex.author);
            const authors = bibtex.author
                .split(' and ')
                .map(author => author.trim())
                .filter(author => author);

            // Add authors one at a time with index
            for (let i = 0; i < authors.length; i++) {
                try {
                    await addAuthor(authors[i], i);
                    await delay(300); // Wait between authors
                } catch (err) {
                    console.error(`Failed to add author ${i}: ${err.message}`);
                    // Continue with next author instead of stopping
                }
            }
        }

        // Fill simple text fields
        Object.entries(fieldMap).forEach(([bibField, formId]) => {
            if (bibtex[bibField]) {
                const elem = document.getElementById(formId);
                if (elem) {
                    // Clean up the value - remove any remaining LaTeX or special characters
                    let value = bibtex[bibField]
                        .replace(/[{}]/g, '')  // Remove any remaining braces
                        .replace(/\\[a-zA-Z]+/g, '') // Remove LaTeX commands
                        .trim();
                    
                    console.log(`Setting ${formId} to:`, value);
                    elem.value = value;
                    // Trigger change event
                    elem.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    console.warn(`Field ${formId} not found: ${bibField} -> ${formId}`);
                }
            }
        });

        // Handle DOI and Open Access
        const doiValue = bibtex.doi || bibtex.DOI || bibtex.Doi;
        if (doiValue) {
            const cleanDoi = doiValue.replace(/[{}]/g, '').trim();
            
            // Set DOI field
            const doiElem = document.getElementById('Doi');
            if (doiElem) {
                console.log('Setting DOI to:', cleanDoi);
                doiElem.value = cleanDoi;
                doiElem.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Set Open Access to Yes and wait for form refresh
            const oaSelect = document.getElementById('OpenAccessStatus');
            if (oaSelect) {
                oaSelect.value = "1"; // Set to "Ja"
                
                // Use jQuery to trigger proper events for form refresh
                $(oaSelect).trigger('change');

                // Use MutationObserver to wait for form updates
                await new Promise((resolve) => {
                    const observer = new MutationObserver(() => {
                        const linkInput = document.getElementById('LinkExternal');
                        if (linkInput && linkInput.type !== 'hidden') {
                            console.log('Setting external link to:', `https://doi.org/${cleanDoi}`);
                            linkInput.value = `https://doi.org/${cleanDoi}`;
                            linkInput.dispatchEvent(new Event('change', { bubbles: true }));
                            observer.disconnect();
                            resolve();
                        }
                    });
                    
                    observer.observe(document.getElementById('PublicationEditSectionId'), { 
                        childList: true, 
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['type']
                    });
                });
            }
        }

        // Handle pages
        if (bibtex.pages) {
            const pages = bibtex.pages.split(/[-–—]/); // Handle different dash types
            const first = pages[0].trim();
            const last = (pages[1] || first).trim();
            
            const firstElem = document.getElementById('FirstPageNumber');
            const lastElem = document.getElementById('LastPageNumber');
            
            if (firstElem) {
                console.log('Setting first page:', first);
                firstElem.value = first;
            }
            if (lastElem) {
                console.log('Setting last page:', last);
                lastElem.value = last;
            }
        }

        // Handle year specially for PublicationDateString
        if (bibtex.year) {
            const dateElem = document.getElementById('PublicationDateString');
            if (dateElem) {
                const year = bibtex.year.replace(/[{}]/g, '').trim();
                const month = bibtex.month ? bibtex.month.replace(/[{}]/g, '').trim() : '01';
                dateElem.value = `${year}-${month}-01`;
                dateElem.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // Set status to Published
        const statusSelect = document.getElementById('MagazineStatus');
        if (statusSelect) {
            statusSelect.value = "2"; // Published
            statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Return true when done
        return true;
    }

    // Update the paste event listener to handle async fillForm
    document.addEventListener('paste', (e) => {
        // Only process if no text input is focused
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA') {
            return;
        }

        const text = e.clipboardData.getData('text');
        if (text.trim().startsWith('@')) {
            e.preventDefault();
            const bibtex = parseBibtex(text);
            if (bibtex) {
                fillForm(bibtex).then(() => {
                    console.log('Form filling completed');
                }).catch(err => {
                    console.error('Error filling form:', err);
                });
            }
        }
    });
})();