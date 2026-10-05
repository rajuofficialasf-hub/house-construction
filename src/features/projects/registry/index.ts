/** প্রকল্প রেজিস্ট্রি — বাইরে থেকে import করার এক দরজা */
export {
  HOUSING_GROUP_KEY,
  SNAPSHOT_KEY,
  childrenOf,
  fallbackSlug,
  findBySlug,
  findProject,
  getRegistry,
  housingProjects,
  leafProjects,
  projectPath,
  refreshProjects,
  type RegistrySource,
  type RegistryState,
} from './projectsStore'
export { useProject, useProjects, useRegistry } from './useProjects'
export { ACCENTS, accentOf, type Accent } from './accents'
export { PROJECT_ICONS, type ProjectIconKey } from './icons'
export { ProjectIcon } from './ProjectIcon'
