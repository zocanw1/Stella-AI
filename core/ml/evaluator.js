class Evaluator {
    static accuracy(predictions, labels) {
        if (predictions.length !== labels.length || predictions.length === 0) return 0;
        let correct = 0;
        for (let i = 0; i < predictions.length; i++) {
            if (predictions[i] === labels[i]) correct++;
        }
        return correct / predictions.length;
    }

    static precisionRecallF1(predictions, labels, classes = null) {
        const allClasses = classes || [...new Set([...labels, ...predictions])];
        const metrics = {};

        for (const cls of allClasses) {
            let tp = 0, fp = 0, fn = 0;
            for (let i = 0; i < predictions.length; i++) {
                const pred = predictions[i];
                const actual = labels[i];
                if (pred === cls && actual === cls) tp++;
                else if (pred === cls && actual !== cls) fp++;
                else if (pred !== cls && actual === cls) fn++;
            }
            const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
            const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
            const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
            metrics[cls] = {
                precision: +precision.toFixed(4),
                recall: +recall.toFixed(4),
                f1Score: +f1.toFixed(4),
                support: labels.filter(l => l === cls).length
            };
        }

        const avg = (key) => {
            const values = Object.values(metrics).map(m => m[key]);
            return values.length > 0 ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(4) : 0;
        };

        return {
            perClass: metrics,
            macroAverage: {
                precision: avg('precision'),
                recall: avg('recall'),
                f1Score: avg('f1Score')
            },
            accuracy: this.accuracy(predictions, labels)
        };
    }

    static confusionMatrix(predictions, labels, classes = null) {
        const allClasses = classes || [...new Set([...labels, ...predictions])].sort();
        const matrix = {};
        for (const actual of allClasses) {
            matrix[actual] = {};
            for (const pred of allClasses) {
                matrix[actual][pred] = 0;
            }
        }
        for (let i = 0; i < predictions.length; i++) {
            matrix[labels[i]][predictions[i]]++;
        }
        return { classes: allClasses, matrix };
    }

    static fullEvaluate(predictions, labels, classes = null, additional = {}) {
        const prf = this.precisionRecallF1(predictions, labels, classes);
        const cm = this.confusionMatrix(predictions, labels, classes);

        return {
            accuracy: prf.accuracy,
            precision: prf.macroAverage.precision,
            recall: prf.macroAverage.recall,
            f1Score: prf.macroAverage.f1Score,
            perClass: prf.perClass,
            confusionMatrix: cm,
            sampleCount: predictions.length,
            trainingLoss: additional.trainingLoss || null,
            validationLoss: additional.validationLoss || null,
            inferenceTimeMs: additional.inferenceTimeMs || null,
            modelSizeBytes: additional.modelSizeBytes || null,
            evaluatedAt: new Date().toISOString()
        };
    }
}

module.exports = Evaluator;
