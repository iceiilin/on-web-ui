import { ChangeDetectorRef, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Comparator, StringFilter } from "@clr/angular";

import { Subject } from 'rxjs/Subject';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Observable } from 'rxjs/Observable';
import * as _ from 'lodash';

import { NODE_TYPE_MAP } from '../../../config/rackhd.config';
import { NodeService } from '../../services/node.service';
import { Node, NodeType, NodeStatus } from '../../models/node';

import { FormControl, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ObmService } from 'app/services/obm.service';
import { OBM } from 'app/models';
import { SKU_URL } from 'app/models/sku';
import { AlphabeticalComparator, DateComparator, ObjectFilterByKey }
  from 'app/utils/inventory-operator';

@Component({
  selector: 'app-nodes',
  templateUrl: './nodes.component.html',
  styleUrls: ['./nodes.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class NodesComponent implements OnInit {
  allNodes: Node[] = [];
  dataStore: Node[] = [];

  nodeTypes: NodeType[];
  nodesDataMatrix = {};
  nodesTypeCountMatrix = {};
  nodesStatusDataMatrix = {};
  nodesStatusCountMatrix = {};

  selectedType: string;
  selectedSku: string;
  selectedNode: Node;
  selectedNodes: Node[];
  isShowDetail: boolean;

  isShowObmDetail: boolean;
  selectedObm: OBM[];

  isShowSkuDetail: boolean;
  skuDetail: any;

  isCreateNode: boolean;
  isDelete: boolean;
  nodeForm: FormGroup;

  // data grid helper
  searchTerms = new Subject<string>();
  dgDataLoading = false;
  dgPlaceholder = 'No nodes found!'
  selectedPageSize = '15';

  get dgPageSize() {
    return +this.selectedPageSize;
  }

  public nameComparator = new AlphabeticalComparator('name');
  public idComparator = new AlphabeticalComparator('id');
  public typeComparator = new AlphabeticalComparator('type');
  public skuComparator = new AlphabeticalComparator('sku');
  public autoDiscoverComparator = new AlphabeticalComparator('autoDiscover');
  public identifiersComparator = new AlphabeticalComparator('identifiers');
  public discoveredTimeComparator = new DateComparator('discoveredTime');
  public typeFilter = new ObjectFilterByKey('type');
  public skuFilter = new ObjectFilterByKey('sku');
  typeFilterValue: string = this.selectedType;
  skuFilterValue: string = this.selectedSku;

  shapeMap = {
    'compute': 'computer',
    'storage': 'data-cluster',
    'network': 'network-switch'
  }

  constructor(public activatedRoute: ActivatedRoute,
    public router: Router,
    public changeDetectorRef: ChangeDetectorRef,
    public nodeService: NodeService,
    public obmService: ObmService,
    private fb: FormBuilder) {
  }

  ngOnInit() {
    let self = this;
    this.nodeService.getNodeTypes().subscribe(
      data => {
        this.nodeTypes = _.transform(
          data,
          function (result, item) {
            let dt = new NodeType();
            if (_.has(NODE_TYPE_MAP, item)) {
              dt.identifier = item;
              dt.displayName = NODE_TYPE_MAP[item];
              result.push(dt);
            }
          }, []);
        this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
          let type = params.get('type');
          if (type) {
            let dt = new NodeType();
            dt.identifier = type;
            dt.displayName = NODE_TYPE_MAP[type];
            this.selectType(dt);
          }
        });
      }
    );

    this.selectedNodes = [];

    // get all nodes directly or concat all nodes of different types
    this.getAllNodes();
    this.createForm();

    let searchTrigger = this.searchTerms.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((term: string) => {
        this.searchIterm(term);
        return 'whatever';
      })
    );
    searchTrigger.subscribe();
  }

  search(term: string): void {
    this.searchTerms.next(term);
  }

  refreshDatagrid() {
    this.dgDataLoading = true;
    this.getAllNodes();
  }

  afterGetNodes() {
    this.nodesTypeCountMatrix = _.transform(this.allNodes, (result, item) => {
      let type = item.type;
      if (!_.has(NODE_TYPE_MAP, type)) {
        type = 'other';
      }
      result[type] ? result[type] += 1 : result[type] = 1;
    }, []);
  }

  // main data resourse
  getAllNodes(): void {
    this.nodeService.getAllNodes()
      .subscribe(data => {
        this.allNodes = data;
        this.dataStore = data;
        this.dgDataLoading = false;
        this.afterGetNodes();
      });
  }

  willCreateNode(): void {
    this.isCreateNode = true;
  }

  willDelete(node?: Node): void {
    if (node) {
      this.selectedNodes = [node];
    }
    this.isDelete = true;
  }

  createForm() {
    this.nodeForm = this.fb.group({
      name: '',
      type: '',
      autoDiscover: '',
      otherConfig: '',
    });
  }

  createNode(): void {
    let value = this.nodeForm.value;
    let jsonData = value['otherConfig'] ? JSON.parse(value['otherConfig']) : {};

    // data transform
    jsonData['name'] = value['name'];
    jsonData['type'] = value['type'];
    jsonData['autoDiscover'] = value['autoDiscover'] === 'true' ? true : false;

    let postData = JSON.stringify(jsonData);
    this.nodeService.creatOneNode(postData)
      .subscribe(data => {
        this.refreshDatagrid();
      });
  }

  delete(): void {
    let res = this.nodeService.deleteNodes(this.selectedNodes);
    for (let entry of res) {
      entry.subscribe(() => {
        this.refreshDatagrid();
      });
    }
  }

  searchIterm(term: string): void {
    const datas = _.cloneDeep(this.dataStore);
    function contains(src: string): boolean {
      if (!src) {
        return false;
      }
      if (!term) {
        return true;
      }
      return src.toLowerCase().includes(term.toLowerCase());
    }
    this.dgDataLoading = true;
    this.allNodes = _.filter(datas, (data) => {
      return contains(data.name) ||
        contains(NODE_TYPE_MAP[data.type]);
    });
    this.dgDataLoading = false;
    this.afterGetNodes();
  }

  selectType(type: NodeType) {
    if (this.selectedType === type.displayName) {
      this.selectedType = '';
    } else {
      //two types of filter.
      // type 1
      this.selectedType = type.displayName;
      // type 2
      // this.nodes = this.nodesDataMatrix[type.identifier];
    }
    this.typeFilterValue = this.selectedType;
    this.changeDetectorRef.detectChanges();
  }

  goToDetail(node: Node) {
    this.selectedNode = node;
    this.isShowDetail = true;
  }

  goToShowObmDetail(node: Node) {
    this.selectedNode = node;
    this.selectedObm = [];
    for (let entry of node.obms) {
      let obmId = entry['ref'].split('/').pop();
      this.getObmById(obmId);
    }
    this.isShowObmDetail = true;
  }

  goToShowSkuDetail(node: Node) {
    this.selectedNode = node;
    let skuId = node.sku ? node.sku.split('/')[4] : '';
    if (skuId) {
      let suffix = SKU_URL.skusById + '?query=' + skuId;
      this.nodeService.get(suffix)
        .subscribe(data => {
          this.skuDetail = data;
          this.isShowSkuDetail = true;
        });
    } else {
      this.skuDetail = [];
      this.isShowSkuDetail = true;
    }
  }

  getObmById(identifier: string): void {
    this.obmService.getObmById(identifier)
      .subscribe(data => {
        this.selectedObm.push(data);
      });
  }
}