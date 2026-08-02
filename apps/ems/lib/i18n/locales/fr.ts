import type { Dictionary } from "./en";

/**
 * Partial by design: this covers the application shell (navigation, header,
 * common controls) to prove the locale machinery end to end. Keys not
 * present here fall back to English rather than rendering blank, so a
 * partial locale is safe to ship — see `isComplete` in ../index.ts, which
 * is what drives the "(partial)" marker in the language selector.
 */
export const fr: Partial<Dictionary> = {
  "app.name": "Wisdom Campus",
  "header.search": "Rechercher",
  "header.searchPlaceholder": "Rechercher élèves, personnel, classes…",
  "header.notifications": "Notifications",
  "header.noNotifications": "Aucune notification",
  "header.aiAssistant": "Assistant IA",
  "header.language": "Langue",
  "header.theme": "Thème",
  "header.themeLight": "Clair",
  "header.themeDark": "Sombre",
  "header.themeSystem": "Système",
  "header.profile": "Profil",
  "header.signOut": "Se déconnecter",
  "header.openMenu": "Ouvrir le menu",

  "sidebar.collapse": "Réduire le menu",
  "sidebar.expand": "Développer le menu",
  "sidebar.searchPlaceholder": "Rechercher dans le menu…",
  "sidebar.favorites": "Favoris",
  "sidebar.recent": "Récemment utilisés",
  "sidebar.noResults": "Aucun élément de menu correspondant",
  "sidebar.addFavorite": "Ajouter aux favoris",
  "sidebar.removeFavorite": "Retirer des favoris",
  "sidebar.planned": "Pas encore développé",
  "sidebar.plannedShort": "Bientôt",

  "common.loading": "Chargement…",
  "common.save": "Enregistrer",
  "common.saved": "Enregistré.",
  "common.cancel": "Annuler",
  "common.create": "Créer",
  "common.publish": "Publier",
  "common.status": "Statut",
  "common.none": "Rien pour le moment.",

  "breadcrumb.home": "Accueil",

  "nav.dashboard": "Tableau de bord",
  "nav.students": "Élèves",
  "nav.parents": "Parents",
  "nav.staff": "Personnel",
  "nav.academics": "Scolarité",
  "nav.examination": "Examens",
  "nav.finance": "Finances",
  "nav.messaging": "Messagerie",
  "nav.settings": "Paramètres",

  "nav.dashboard.overview": "Vue d'ensemble",
  "nav.dashboard.analytics": "Analytique",
  "nav.dashboard.notifications": "Notifications",

  "nav.students.list": "Liste des élèves",
  "nav.students.registration": "Inscription des élèves",
  "nav.students.attendance": "Présence",

  "nav.staff.teachers": "Enseignants",
  "nav.staff.directory": "Annuaire du personnel",

  "nav.academics.classes": "Classes",
  "nav.academics.subjects": "Matières",
  "nav.academics.curriculum": "Programme",
  "nav.academics.lessonPlans": "Plans de cours",
  "nav.academics.timetable": "Emploi du temps",

  "nav.examination.quizzes": "Questionnaires",
  "nav.examination.results": "Résultats",

  "nav.settings.schoolProfile": "Profil de l'école",
  "nav.settings.languages": "Langues",
  "nav.settings.ai": "Paramètres IA",

  "dashboard.title": "Vue d'ensemble",
  "dashboard.welcome": "Bon retour",
  "dashboard.students": "Élèves",
  "dashboard.teachers": "Enseignants",
  "dashboard.classes": "Classes",
  "dashboard.subjects": "Matières",
};
