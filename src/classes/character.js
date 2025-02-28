import { firstNames, surnames } from "../lists/character_names.js";

export class Character {
    constructor() {
        this.name = firstNames[Math.floor(Math.random() * firstNames.length)];
        this.surname = surnames[Math.floor(Math.random() * surnames.length)];
        this.level = 1;
        this.hitPoints = 10;
        this.inventory = [];
    }

    // Getters
    //-------------------------------------------------------------------------------
    get getName() {
        return this.name;
    }

    get getSurname() {
        return this.surname;
    }

    get getFullName() {
        return this.getName + " " + this.getSurname;
    }

    get getLevel() {
        return this.level;
    }

    get getHitPoints() {
        return this.hitPoints;
    }

    get getInventory() {
        return this.getInventory;
    }
    //-------------------------------------------------------------------------------

    // Setters
    //-------------------------------------------------------------------------------
    setName(name) {
        this.name = name;
    }
    setSurname(surname) {
        this.surname = surname;
    }

    setLevel(level) {
        this.level = level;
    }

    setHitPoints(hitPoints) {
        this.hitPoints = hitPoints;
    }

    setInventory(inventory) {
        this.inventory = inventory;
    }
    //-------------------------------------------------------------------------------
}