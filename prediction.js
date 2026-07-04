// Prediction algorithm
function generatePrediction(history = []) {
  const colors = ['RED', 'GREEN', 'VIOLET'];
  
  // If no history, return random
  if (!history || history.length === 0) {
    return {
      color: colors[Math.floor(Math.random() * 3)],
      number: Math.floor(Math.random() * 10),
      confidence: 50
    };
  }
  
  // Count color frequency in last 50
  const recentHistory = history.slice(0, 50);
  const colorCount = { RED: 0, GREEN: 0, VIOLET: 0 };
  
  recentHistory.forEach(item => {
    const color = item.color?.toUpperCase();
    if (colorCount[color] !== undefined) {
      colorCount[color]++;
    }
  });
  
  // Find consecutive pattern
  let consecutive = 1;
  const lastColor = recentHistory[0]?.color?.toUpperCase();
  
  for (let i = 1; i < Math.min(recentHistory.length, 10); i++) {
    if (recentHistory[i]?.color?.toUpperCase() === lastColor) {
      consecutive++;
    } else {
      break;
    }
  }
  
  // Scoring system
  let scores = { RED: 33, GREEN: 33, VIOLET: 33 };
  
  // Rule 1: Low frequency color gets bonus
  const totalRecent = recentHistory.length || 1;
  scores.RED += ((1 - colorCount.RED / totalRecent) * 20);
  scores.GREEN += ((1 - colorCount.GREEN / totalRecent) * 20);
  scores.VIOLET += ((1 - colorCount.VIOLET / totalRecent) * 20);
  
  // Rule 2: If 3+ consecutive, reduce that color
  if (consecutive >= 3 && lastColor) {
    scores[lastColor] -= 25;
  }
  
  // Rule 3: VIOLET appears less frequently
  scores.VIOLET += 5;
  
  // Find best color
  let predictedColor = 'RED';
  let maxScore = 0;
  
  for (let color in scores) {
    if (scores[color] > maxScore) {
      maxScore = scores[color];
      predictedColor = color;
    }
  }
  
  // Number prediction based on color
  let predictedNumber;
  if (predictedColor === 'RED') {
    predictedNumber = [0, 2, 4, 6, 8][Math.floor(Math.random() * 5)];
  } else if (predictedColor === 'GREEN') {
    predictedNumber = [1, 3, 5, 7, 9][Math.floor(Math.random() * 5)];
  } else {
    predictedNumber = [0, 5][Math.floor(Math.random() * 2)];
  }
  
  // Confidence calculation
  const confidence = Math.min(Math.floor(maxScore * 1.5), 95);
  
  return {
    color: predictedColor,
    number: predictedNumber,
    confidence: confidence
  };
}

module.exports = { generatePrediction };