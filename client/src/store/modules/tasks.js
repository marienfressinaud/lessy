import moment from 'moment'
import sanitizeHtml from 'sanitize-html'
import anchorme from 'anchorme'

import { mapElementsById } from '@/utils/array'

import { getWhileNext } from '@/api/http'
import tasksApi from '@/api/tasks'

const state = {
  byIds: {},
}

const getters = {
  findById (state, getters) {
    return id => {
      const task = state.byIds[id]
      if (task == null) {
        return null
      }

      const today = moment()

      const isFinished = task.state === 'finished'
      const isAbandoned = task.state === 'abandoned'

      const isForToday = task.plannedAt && moment(task.plannedAt).isBetween(
        today.startOf('day'),
        today.endOf('day'),
        'day',
        '[]'
      )
      const isBacklogged = !isFinished && !isAbandoned && !isForToday
      const startedSinceWeeks = task.startedAt ? moment().diff(task.startedAt, 'weeks') : 0

      const allowedTags = ['b', 'i', 'em', 'strong']
      const anchorOptions = {
        exclude: url => url.toLowerCase().indexOf("file:///") === 0,
        attributes: {
          target: "_blank",
          rel: "noreferrer"
        }
      }

      return {
        ...task,
        isForToday,
        isBacklogged,
        isFinished,
        isAbandoned,
        startedAt: task.startedAt ? new Date(task.startedAt) : null,
        plannedAt: task.plannedAt ? new Date(task.plannedAt) : null,
        finishedAt: task.finishedAt ? new Date(task.finishedAt) : null,
        abandonedAt: task.abandonedAt ? new Date(task.abandonedAt) : null,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
        startedSinceWeeks,
        replannedCount: task.plannedCount - 1,
        formattedLabel: anchorme({input: sanitizeHtml(task.label, { allowedTags }), options: anchorOptions}),
      }
    }
  },

  list (state, getters) {
    return Object.keys(state.byIds)
                 .map(getters.findById)
                 .filter((task) => !task.isAbandoned)
                 .sort((t1, t2) => t1.order - t2.order)
  },

  listForToday (state, getters) {
    return getters
      .list
      .filter((task) => task.isForToday)
  },

  listTodoForToday (state, getters) {
    return getters
      .list
      .filter((task) => task.isForToday && !task.isFinished)
      .sort((t1, t2) => t1.plannedAt - t2.plannedAt)
  },

  listFinishedToday (state, getters) {
    return getters
      .list
      .filter((task) => task.isForToday && task.isFinished)
      .sort((t1, t2) => t1.finishedAt - t2.finishedAt)
  },

  listBacklog (state, getters) {
    return getters
      .list
      .filter((task) => task.isBacklogged && task.state !== 'newed')
  },

  listFinished (state, getters) {
    return getters.list.filter((task) => task.isFinished)
  },

  listForProject (state, getters, rootState, rootGetters) {
    return project => {
      return getters.list.filter((task) => task.projectId === project.id)
    }
  },

  listTodoForCurrentProject (state, getters, rootState, rootGetters) {
    const currentProject = rootGetters['projects/current']
    return getters
      .listForProject(currentProject)
      .filter((task) => !task.isFinished)
      .sort((t1, t2) => t1.order - t2.order)
  },

  listFinishedForCurrentProject (state, getters, rootState, rootGetters) {
    const currentProject = rootGetters['projects/current']
    return getters
      .listForProject(currentProject)
      .filter((task) => task.isFinished)
      .sort((t1, t2) => t1.finishedAt - t2.finishedAt)
  },

  listFinishedByDays (state, getters) {
    const byDays = {}
    getters.listFinished.forEach((task) => {
      const key = moment(task.finishedAt).format('YYYY-MM-DD')
      if (byDays[key] == null) {
        byDays[key] = []
      }
      byDays[key].push(task)
    })
    return byDays
  },

  listCreatedByDays (state, getters) {
    const byDays = {}
    getters.list.forEach((task) => {
      const key = moment(task.startedAt).format('YYYY-MM-DD')
      if (byDays[key] == null) {
        byDays[key] = []
      }
      byDays[key].push(task)
    })
    return byDays
  },
}

const actions = {
  list ({ commit }) {
    return tasksApi.list()
                   .then(getWhileNext((res) => commit('addList', res.data)))
  },

  get ({ commit }, { id }) {
    return tasksApi
      .get(id)
      .then((res) => commit('set', res.data))
  },

  create ({ commit }, payload) {
    return tasksApi
      .create(payload)
      .then((res) => {
        commit('addList', [res.data])
        return res.data.id
      })
  },

  update ({ commit }, { task, ...payload }) {
    return tasksApi.update(task, payload)
                   .then((res) => commit('set', res.data))
  },

  finish ({ commit }, { task }) {
    return tasksApi.finish(task)
                   .then((res) => commit('set', res.data))
  },

  restart ({ commit }, { task }) {
    return tasksApi.restart(task)
                   .then((res) => commit('set', res.data))
  },

  start ({ commit }, { task }) {
    return tasksApi.start(task)
                   .then((res) => commit('set', res.data))
  },

  unplan ({ commit }, { task }) {
    return tasksApi.unplan(task)
                   .then((res) => commit('set', res.data))
  },

  abandon ({ commit }, { task }) {
    return tasksApi.abandon(task)
                   .then((res) => commit('set', res.data))
  },

  updateOrder ({ commit }, { task, order }) {
    return tasksApi.updateOrder(task, order)
                   .then((res) => commit('setOrder', res.data))
  },
}

const mutations = {
  addList (state, data) {
    let byIds = {}
    data.forEach((element) => {
      byIds[element.id] = {
        id: element.id,
        ...element.attributes,
        userId: element.relationships.user.data.id,
      }
      if (element.relationships.project.data != null) {
        byIds[element.id].projectId = element.relationships.project.data.id
      }
    })

    state.byIds = {
      ...state.byIds,
      ...byIds,
    }
  },

  set (state, data) {
    let byIds = {
      ...state.byIds,
      [data.id]: {
        id: data.id,
        ...data.attributes,
        userId: data.relationships.user.data.id,
      },
    }
    if (data.relationships.project.data != null) {
      byIds[data.id].projectId = data.relationships.project.data.id
    }
    state.byIds = byIds
  },

  setOrder (state, data) {
    const impactedTasks = data.map(task => {
      return {
        ...state.byIds[task.id],
        order: task.attributes.order,
      }
    }).filter(task => task.id != null)
    state.byIds = {
      ...state.byIds,
      ...mapElementsById(impactedTasks),
    }
  },

  startTasksForProject (state, projectId) {
    const tasks = Object.entries(state.byIds).map(([id, task]) => {
      if (task.projectId !== projectId || task.state !== 'newed') {
        return task
      }
      return {
        ...task,
        state: 'started',
        startedAt: new Date(),
      }
    })
    state.byIds = mapElementsById(tasks)
  },

  cancelTasksForProject (state, projectId) {
    const tasks = Object.entries(state.byIds).map(([id, task]) => {
      if (task.projectId !== projectId || task.state !== 'started') {
        return task
      }
      return {
        ...task,
        state: 'newed',
        startedAt: null,
      }
    })
    state.byIds = mapElementsById(tasks)
  },

  abandonTasksForProject (state, projectId) {
    const tasks = Object.entries(state.byIds).map(([id, task]) => {
      if (task.projectId !== projectId) {
        return task
      }
      return {
        ...task,
        state: 'abandoned',
        abandonedAt: +moment(),
      }
    })
    state.byIds = mapElementsById(tasks)
  },

  reset (state) {
    state.current = null
    state.byIds = {}
  },
}

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
}
