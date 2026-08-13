class StartCard {
  const StartCard({
    required this.id,
    required this.german,
    required this.persian,
    required this.definition,
    required this.exampleGerman,
    required this.examplePersian,
    required this.imageAsset,
    required this.wordAudioAsset,
    required this.sentenceAudioAsset,
  });

  final String id;
  final String german;
  final String persian;
  final String definition;
  final String exampleGerman;
  final String examplePersian;
  final String imageAsset;
  final String wordAudioAsset;
  final String sentenceAudioAsset;
}
