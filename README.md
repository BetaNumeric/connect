# **Connect**

[**Live Demo**](https://betanumeric.github.io/connect/)

Connect is a small physics-based drawing puzzle. The goal is simple: bring a blue ball and a yellow ball together. To do this, you draw lines on the screen that immediately turn into physical objects as soon as you lift your pen, falling under gravity and interacting with the environment.

The project is built using [p5.js](https://p5js.org/) for the visuals and [Planck.js](https://github.com/shakiba/planck.js/) for the 2D physics.

## **How to Play**

1. Observe the layout of the level (platforms, rotors, and obstacles).  
2. Click and drag to draw lines.  
3. Release to turn your drawing into a physical object.

## **Running Locally**

Because the game loads level data via JSON, you need to run it through a local static server rather than just opening the file in a browser.

If you have Python installed, you can run:

python \-m http.server 8000

Then navigate to http://localhost:8000 to play or http://localhost:8000/editor.html to access the level editor.

## **Level Editor**

The project includes a built-in level editor (editor.html). It allows you to place shapes, create rigid groups, and configure rotors. You can export your creations as JSON files and add them to the game manifest to create new challenges.
