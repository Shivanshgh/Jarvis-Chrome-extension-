# JARVIS New Tab

A lightweight Chrome New Tab extension built with HTML, CSS, and JavaScript. It has a transparent particle orb, clock, date, time-based greeting, Google search, editable shortcuts, and optional voice search.

## Install locally
1.Set up a new folder. 
2.Download the zip file in the new folder.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose this project folder.
6. Open a new tab.

## Features

- Google search without an external API.
- Shortcuts that can be added, edited, or removed; they are saved in Chrome local storage.
- Voice search when the browser supports Web Speech Recognition. Microphone access is used only while voice search is active.
- An idle orb glow and live audio response during voice search.

The extension requests only Chrome's `storage` permission. Replace `assets/sphere.png` to change the transparent orb image.
